import type { ParsedEvent } from '@studysuite/shared'
import { parisDate } from '@studysuite/shared/time'
import { categorizeLines, isPathLine, roomsWithPath } from '../parser/lines.js'
import { isTeacherLine } from '../parser/teacher.js'
import { PX_PER_DAY, type SquareEvent } from './planning.js'

/**
 * An event as the planning shows it, plus what the timetable carries that
 * `ParsedEvent` has no field for yet.
 */
export interface AdeEvent extends ParsedEvent {
    /** ADE's event id. Stable across runs, unlike the pixel box. */
    adeId: number
    /** The `#rrggbb` the planning paints the event with: its subject. */
    color: string | null
}

const HOURS = /^(\d{1,2})h(\d{2}) - (\d{1,2})h(\d{2})$/

/**
 * The days an event covers, as column indexes. Most sit in one column. ADE
 * draws an event booked on consecutive days at the same hours as one box
 * spanning their columns (a GEA course on Tuesday and Wednesday 13h30), and
 * then the box is aligned on whole columns. Anything else straddling a
 * boundary is not understood, and refused rather than given a guessed day.
 */
function columnsOf(s: SquareEvent): number[] {
    const first = Math.floor((s.left + 1) / PX_PER_DAY)
    const last = Math.floor((s.left + s.width) / PX_PER_DAY - 1e-9)
    if (first === last) return [first]
    const aligned = (s.left + 1) % PX_PER_DAY === 0 && s.width % PX_PER_DAY === 0
    if (!aligned) {
        throw new Error(
            `ADE event ${s.eventId} does not sit in one day column (left ${s.left}, width ${s.width})`,
        )
    }
    return Array.from({ length: last - first + 1 }, (_, k) => first + k)
}

/**
 * One stretch of an event's time, with the room lines printed above it.
 * An event usually has one hours line, last. One that changes room mid-way
 * prints a second (`K212 … 08h00 - 10h00 | K211 | 10h00 - 12h00`), each
 * after its own rooms.
 */
interface Slot {
    hours: RegExpExecArray
    /** The lines between the previous hours line (or the title) and this one. */
    lines: string[]
}

/**
 * Turns drawn events into dated ones.
 *
 * `columns` is the date under each day column, left to right. A column is
 * `PX_PER_DAY` wide and starts one pixel early (its border), so `left + 1`
 * falls inside the column the event belongs to.
 *
 * One ADE event can give several: one per day it is drawn across, and one per
 * hours line when it changes room. They share the `adeId`.
 */
export function toEvents(squares: readonly SquareEvent[], columns: readonly string[]): AdeEvent[] {
    // Some events are drawn several times over (`Tutorat` once per group
    // sub-column) under a single ADE id. The first drawing stands for all.
    const seen = new Set<number>()
    const unique = squares.filter((s) => !seen.has(s.eventId) && seen.add(s.eventId))

    const lineSets = unique.map((s) =>
        s.lines.map((l) => l.replace(/\u00a0/g, ' ').trim()).filter((l) => l.length > 0),
    )
    const knownRooms = roomsWithPath(lineSets.map((l) => l.slice(1).filter((x) => !HOURS.test(x))))

    return unique.flatMap((s, k) => {
        const lines = lineSets[k]!
        const days = columnsOf(s).map((col) => {
            const day = columns[col]
            if (!day) throw new Error(`ADE event ${s.eventId} sits outside the drawn days`)
            return day
        })

        const slots: Slot[] = []
        let pending: string[] = []
        for (const line of lines.slice(1)) {
            const hours = HOURS.exec(line)
            if (hours) {
                slots.push({ hours, lines: pending })
                pending = []
            } else pending.push(line)
        }
        if (lines.length < 2 || slots.length === 0) {
            throw new Error(`ADE event ${s.eventId} has no hours line: ${JSON.stringify(lines)}`)
        }

        // Teachers and groups are printed once, in the first slot. Later
        // slots, and lines after the last hours line, only add rooms: the
        // latter for every slot, since nothing says which one they belong to.
        const first = categorizeLines(slots[0]!.lines, knownRooms)
        const extraRooms = (ls: string[]) =>
            ls.filter((l) => !isPathLine(l) && !isTeacherLine(l)).map((name) => ({ name }))
        const trailing = extraRooms(pending)
        const roomsOf = (i: number) =>
            dedupeRooms([...(i === 0 ? first.rooms : extraRooms(slots[i]!.lines)), ...trailing])

        if (slots.length > 1 && days.length > 1) {
            throw new Error(`ADE event ${s.eventId} spans several days and several hours lines`)
        }

        return days.flatMap((day) => {
            const [y, m, d] = day.split('-').map(Number) as [number, number, number]
            const at = (h: string, min: string) => parisDate(y, m, d, Number(h), Number(min))
            return slots.map(({ hours }, i) => ({
                adeId: s.eventId,
                title: lines[0]!,
                startDate: at(hours[1]!, hours[2]!),
                endDate: at(hours[3]!, hours[4]!),
                rooms: roomsOf(i),
                teachers: first.teachers,
                groups: first.groups,
                color: s.background,
            }))
        })
    })
}

function dedupeRooms(rooms: { name: string }[]): { name: string }[] {
    const seen = new Set<string>()
    return rooms.filter((r) => !seen.has(r.name) && seen.add(r.name))
}
