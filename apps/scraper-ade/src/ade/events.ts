import type { ParsedEvent } from '@studysuite/shared'
import { parisDate } from '@studysuite/shared/time'
import { categorizeLines, roomsWithPath } from '../parser/lines.js'
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
 * Turns drawn events into dated ones.
 *
 * `columns` is the date under each day column, left to right. A column is
 * `PX_PER_DAY` wide and starts one pixel early (its border), so `left + 1`
 * falls inside the column the event belongs to.
 *
 * The planning prints Paris hours, so each one is resolved through
 * Europe/Paris into the instant it denotes (see AGENTS.md, Time).
 */
export function toEvents(squares: readonly SquareEvent[], columns: readonly string[]): AdeEvent[] {
    // Some events are drawn several times over (`Tutorat` once per group
    // sub-column) under a single ADE id. The first drawing stands for all.
    const seen = new Set<number>()
    const unique = squares.filter((s) => !seen.has(s.eventId) && seen.add(s.eventId))

    const lineSets = unique.map((s) =>
        s.lines.map((l) => l.replace(/\u00a0/g, ' ').trim()).filter((l) => l.length > 0),
    )
    const knownRooms = roomsWithPath(lineSets.map((l) => l.slice(1, -1)))

    return unique.map((s, k) => {
        const lines = lineSets[k]!
        const col = Math.floor((s.left + 1) / PX_PER_DAY)
        const day = columns[col]
        if (!day || Math.floor((s.left + s.width) / PX_PER_DAY - 1e-9) !== col) {
            throw new Error(
                `ADE event ${s.eventId} does not sit in one day column (left ${s.left}, width ${s.width})`,
            )
        }
        const hours = HOURS.exec(lines[lines.length - 1] ?? '')
        if (lines.length < 2 || !hours) {
            throw new Error(`ADE event ${s.eventId} has no hours line: ${JSON.stringify(lines)}`)
        }

        const [y, m, d] = day.split('-').map(Number) as [number, number, number]
        const at = (h: string, min: string) => parisDate(y, m, d, Number(h), Number(min))
        const { rooms, teachers, groups } = categorizeLines(lines.slice(1, -1), knownRooms)

        return {
            adeId: s.eventId,
            title: lines[0]!,
            startDate: at(hours[1]!, hours[2]!),
            endDate: at(hours[3]!, hours[4]!),
            rooms,
            teachers,
            groups,
            color: s.background,
        }
    })
}
