import { applyWeekEvents, createDb, insertAllChanges } from '@studysuite/db'
import type { WeekDiff } from '@studysuite/db'
import type { ParsedEvent } from '@studysuite/shared'
import { wallClockNow } from '@studysuite/shared/time'
import { toEvents } from '../ade/events.js'
import { login } from '../ade/login.js'
import { getDisplayConfigurationId, getTimetable, getWeeks } from '../ade/planning.js'
import type { Config } from '../config.js'

type Db = ReturnType<typeof createDb>

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The Monday opening the week a wall-clock label falls in.
 *
 * UTC getters throughout: the label already *is* the Paris day, so reading it
 * any other way would shift the week boundary by the offset.
 */
function weekMonday(label: Date): Date {
    const d = new Date(Date.UTC(label.getUTCFullYear(), label.getUTCMonth(), label.getUTCDate()))
    // getUTCDay: 0 = Sunday, so map it to 6 to make Monday the origin.
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
    return d
}

export interface ScrapeResult {
    added: number
    removed: number
    updated: number
    moved: number
    weeks: number
    events: number
    durationMs: number
}

export async function scrapePlanning(config: Config, db: Db): Promise<ScrapeResult> {
    const t0 = Date.now()
    const origin = new URL(config.scrape.url).origin
    const dataParam = config.scrape.url.split('data=')[1]?.trim()
    if (!dataParam) throw new Error('scrape.url has no ?data= parameter')

    const now = wallClockNow()
    const from = new Date(now.getTime() - config.scrape.pastDays * DAY_MS)
    const to = new Date(now.getTime() + config.scrape.futureDays * DAY_MS)

    const session = await login(origin, dataParam)
    console.log(`[scraper] Signed in, ${session.resources.length} resources`)
    const configId = await getDisplayConfigurationId(session)

    // The session is bound to one ADE project, an academic year, and only
    // its weeks can be fetched. Weeks of the window outside it are left alone
    // rather than reconciled against nothing.
    const first = weekMonday(from).getTime()
    const last = weekMonday(to).getTime()
    const weeks = (await getWeeks(session)).filter(
        (w) => w.monday.getTime() >= first && w.monday.getTime() <= last,
    )
    if (weeks.length === 0) {
        // Never fall through to reconciliation here: `applyWeekEvents` deletes
        // whatever a week holds that the scrape did not return.
        throw new Error('The ADE project has no week in the configured range')
    }
    console.log(
        `[scraper] ${weeks.length} weeks: ` +
            `${weeks[0]!.monday.toISOString().slice(0, 10)} → ${weeks.at(-1)!.monday.toISOString().slice(0, 10)}`,
    )

    // One call for the whole range: the timetable takes a list of weeks.
    const { events: squares, columns } = await getTimetable(
        session,
        configId,
        weeks.map((w) => w.index),
    )
    const expected = weeks.flatMap((w) =>
        session.days.map((d) =>
            new Date(w.monday.getTime() + d * DAY_MS).toISOString().slice(0, 10),
        ),
    )
    if (columns.join() !== expected.join()) {
        throw new Error(
            `ADE drew ${columns.length} day columns, not the ${expected.length} requested`,
        )
    }

    const events = toEvents(squares, columns)
    if (events.length === 0) {
        throw new Error('ADE returned an empty timetable, refusing to reconcile')
    }

    const byWeek = new Map<number, ParsedEvent[]>()
    for (const event of events) {
        const key = weekMonday(event.startDate).getTime()
        const bucket = byWeek.get(key)
        if (bucket) bucket.push(event)
        else byWeek.set(key, [event])
    }

    // Every fetched week, not only the ones that came back with events: a week
    // whose classes were all cancelled still has rows to remove, and it is only
    // reconciled if `applyWeekEvents` is called for it.
    const diffs: WeekDiff[] = []
    for (const { monday } of weeks) {
        const diff = await applyWeekEvents(db, monday, byWeek.get(monday.getTime()) ?? [])
        diffs.push(diff)
        if (diff.added.length || diff.removed.length || diff.updated.length) {
            console.log(
                `[scraper]   Week ${monday.toISOString().slice(0, 10)}: ` +
                    `+${diff.added.length} -${diff.removed.length} ~${diff.updated.length}`,
            )
        }
    }

    // One batch, after every week: cross-week move detection needs to compare
    // removals and additions from different weeks against each other.
    const stats = await insertAllChanges(db, diffs)
    console.log(
        `[scraper] Changes: added ${stats.added}, removed ${stats.removed}, ` +
            `updated ${stats.updated}, moved ${stats.moved}`,
    )

    return {
        ...stats,
        weeks: diffs.length,
        events: events.length,
        durationMs: Date.now() - t0,
    }
}
