import { GwtReader, parseResponse, postRpc, RpcWriter } from './gwt.js'
import type { AdeSession } from './login.js'

/**
 * The planning RPCs the GWT client makes to draw a week, replayed without it.
 *
 * `getTimetable` is the one that matters: it returns every event as the page
 * draws it: the same text lines, the colour, and a pixel box. It takes a
 * *list* of weeks, so a whole academic year arrives in one call; the server
 * only needs `getLegends` for the same weeks first, which primes the session
 * (skip it and `getTimetable` answers `//EX`).
 */

/**
 * Width we ask the grid to be drawn at, per day column. The response places
 * events in pixels, so a round number per day makes the day a division rather
 * than a guess: at 1000 px a column starts at `k·1000 − 1`, one pixel of border
 * before the boundary, and no event is wider than its column.
 */
export const PX_PER_DAY = 1000
const GRID_HEIGHT = 1970

const T = {
    long: 'J',
    int: 'I',
    bool: 'Z',
    string: 'java.lang.String/2004016611',
    list: 'java.util.List',
    selection: 'com.adesoft.gwt.core.client.rpc.data.planning.PlanningSelection/927838067',
    sortInfo: 'com.extjs.gxt.ui.client.data.SortInfo/1143517771',
    sortDir: 'com.extjs.gxt.ui.client.Style$SortDir/3873584144',
    arrayList: 'java.util.ArrayList/4159755760',
} as const

/** `PlanningSelection`: which days, resources and weeks to draw, and how. */
function writeSelection(w: RpcWriter, s: AdeSession, configId: number, weeks: readonly number[]) {
    w.push(w.str(T.selection))
    w.intList(s.days)
    w.push(configId, w.str('Cumul'), w.str('Déplacement'), 0, 0)
    w.intList(s.resources)
    w.intList(weeks)
}

/** The display configuration's numeric id, from the name login handed out. */
export async function getDisplayConfigurationId(s: AdeSession): Promise<number> {
    const w = new RpcWriter(
        s.moduleBase,
        'ConfigurationServiceProxy',
        'method28getDisplayConfigurationByName',
        [T.long, T.string, T.bool],
    )
    w.push(s.connectionId, w.str(s.displayConfName), 0)
    const { stream } = parseResponse(await postRpc(s, 'ConfigurationServiceProxy', w.toString()))
    const id = stream[0]
    if (typeof id !== 'number' || id <= 0)
        throw new Error('ADE returned no display configuration id')
    return id
}

export interface AdeWeek {
    /** What `getTimetable` calls it: 0 for the first week of the project. */
    index: number
    /** That week's Monday, as a UTC-midnight label. */
    monday: Date
}

/** A week record in ADE's calendar format: `{"<id>""<epoch ms>""S<n>-<label>""<bool>"`. */
const WEEK_RECORD = /\{"(\d+)""(\d{12,14})""S\d+-[^"]*""(?:true|false)"/g

/**
 * Every week of the session's project. `getCalendar` answers with ADE's own
 * record format packed into one string: a master list of every week the
 * calendar spans (decades of them), then the project's weeks grouped by month
 * and by year. Only the grouped ones exist in the project: asking the
 * timetable for any other answers `ArrayIndexOutOfBoundsException`.
 *
 * Ids start at 1; the timetable counts from 0.
 */
export async function getWeeks(s: AdeSession): Promise<AdeWeek[]> {
    const w = new RpcWriter(s.moduleBase, 'DirectPlanningServiceProxy', 'method2getCalendar', [
        T.long,
        T.string,
        T.string,
        T.string,
    ])
    // The client sends its summer and winter offsets; they only shape the
    // labels, not which week is which.
    w.push(s.connectionId, w.str('Etc/GMT-2'), w.str('Etc/GMT-1'), w.str('Etc/GMT-2'))
    const { strings } = parseResponse(await postRpc(s, 'DirectPlanningServiceProxy', w.toString()))
    return projectWeeks(strings.join(''))
}

export function projectWeeks(blob: string): AdeWeek[] {
    // The master list is the first `[n]` directly followed by week records.
    const master = /\[(\d+)\](?=\{"\d+""\d{12,14}""S\d+-)/.exec(blob)
    if (!master) throw new Error('ADE calendar has no week list')
    const records = new RegExp(WEEK_RECORD.source, 'y')
    records.lastIndex = master.index + master[0].length
    for (let k = 0; k < Number(master[1]); k++) {
        if (!records.exec(blob)) throw new Error('ADE calendar week list is malformed')
    }

    const weeks = new Map<number, Date>()
    for (const m of blob.slice(records.lastIndex).matchAll(WEEK_RECORD)) {
        // Half a day forward first: an epoch at local midnight is the previous
        // evening in UTC, and would land on the Sunday.
        const at = new Date(Number(m[2]) + 12 * 3_600_000)
        weeks.set(
            Number(m[1]) - 1,
            new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate())),
        )
    }
    const out = [...weeks]
        .map(([index, monday]) => ({ index, monday }))
        .sort((a, b) => a.index - b.index)
    if (out.length === 0) throw new Error('ADE calendar groups no week into the project')
    return out
}

/** One event as the planning draws it. */
export interface SquareEvent {
    /** ADE's event id. The page draws some events more than once; this is how to tell. */
    eventId: number
    /** The text lines, in display order: title, rooms, paths, teachers, groups, hours. */
    lines: string[]
    /** Background `#rrggbb`. */
    background: string
    left: number
    width: number
}

const hex = (r: number, g: number, b: number) =>
    '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')

/**
 * The classes a `getTimetable` response carries, read positionally, since GWT
 * names no fields. Only what the scraper uses is named; the rest is read to stay
 * in step. `decodeTimetable` checks the stream is consumed exactly, so a layout
 * change fails loudly instead of shifting every field by one.
 */
const TIMETABLE_HANDLERS: Record<string, (r: GwtReader) => unknown> = {
    'com.adesoft.gwt.core.client.rpc.data.TFAvailabilityLevel': (r) => {
        r.track({})
        r.int()
        return null
    },
    'com.adesoft.gwt.core.client.ui.tf.AvailabilityNoteOwner': (r) => {
        r.track({})
        r.int()
        r.string()
        r.string()
        r.int()
        r.object()
        r.string()
        return null
    },
    'com.adesoft.gwt.core.client.ui.tf.AvailabilityNote': (r) => {
        r.track({})
        r.int()
        r.object()
        for (let k = 0; k < 4; k++) r.int()
        return null
    },
    'com.adesoft.gwt.core.client.rpc.data.planning.SquareEvent': (r) => {
        const e = r.track({} as SquareEvent)
        r.object() // activity ids
        r.object() // availability notes
        r.string()
        // Blue, green, red: background, then foreground.
        const [bb, bg, br] = [r.int(), r.int(), r.int()]
        r.int()
        r.int()
        r.int()
        const ids = r.object() as number[]
        e.eventId = ids[0]!
        r.int()
        r.int()
        r.int()
        r.object() // one flag per line
        // Lines interleaved with nulls.
        e.lines = (r.object() as (string | null)[]).filter((l): l is string => l !== null)
        r.string()
        r.string()
        r.string()
        r.int()
        r.int() // height
        e.width = r.int()
        e.left = r.int()
        r.int() // top
        e.background = hex(br, bg, bb)
        return e
    },
}

export function decodeTimetable(resp: string): SquareEvent[] {
    const { stream, strings } = parseResponse(resp)
    const r = new GwtReader(stream, strings, TIMETABLE_HANDLERS)
    const events = r.object() as SquareEvent[]
    if (!r.done) throw new Error('ADE timetable layout changed: stream not fully consumed')
    return events
}

/** The day headers a legends response carries, in column order, as `YYYY-MM-DD`. */
export function legendDates(resp: string): string[] {
    const { strings } = parseResponse(resp)
    return strings.flatMap((s) => {
        const m =
            /^(?:Lundi|Mardi|Mercredi|Jeudi|Vendredi|Samedi|Dimanche) (\d\d)\/(\d\d)\/(\d{4})$/.exec(
                s,
            )
        return m ? [`${m[3]}-${m[2]}-${m[1]}`] : []
    })
}

/** `getLegends`: the grid's headers. Called for its side effect as much as its answer. */
export function legendsBody(s: AdeSession, configId: number, weeks: readonly number[]): string {
    const w = new RpcWriter(
        s.moduleBase,
        'DirectPlanningPlanningServiceProxy',
        'method6getLegends',
        [T.long, T.selection, T.sortInfo, T.list],
    )
    w.push(s.connectionId)
    writeSelection(w, s, configId, weeks)
    // SortInfo(ASC, "NAME"), then an empty list.
    w.push(w.str(T.sortInfo), w.str(T.sortDir), 1, w.str('NAME'))
    w.push(w.str(T.arrayList), 0)
    return w.toString()
}

/** `getTimetable`: every event of `weeks`, laid out on a grid `width` pixels wide. */
export function timetableBody(
    s: AdeSession,
    configId: number,
    weeks: readonly number[],
    width: number,
): string {
    const w = new RpcWriter(
        s.moduleBase,
        'DirectPlanningPlanningServiceProxy',
        'method10getTimetable',
        [T.long, T.selection, T.int, T.int, T.bool, T.list, T.list],
    )
    w.push(s.connectionId)
    writeSelection(w, s, configId, weeks)
    w.push(width, GRID_HEIGHT, 1, w.str(T.arrayList), 0, w.str(T.arrayList), 0)
    return w.toString()
}

/** The planning for `weeks`, drawn `PX_PER_DAY` wide per day column. */
export async function getTimetable(
    s: AdeSession,
    configId: number,
    weeks: readonly number[],
): Promise<{ events: SquareEvent[]; columns: string[] }> {
    const service = 'DirectPlanningPlanningServiceProxy'
    const columns = legendDates(await postRpc(s, service, legendsBody(s, configId, weeks)))
    const width = weeks.length * s.days.length * PX_PER_DAY
    const events = decodeTimetable(
        await postRpc(s, service, timetableBody(s, configId, weeks, width)),
    )
    return { events, columns }
}
