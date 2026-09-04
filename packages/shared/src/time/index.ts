/**
 * The planning is stored as Paris wall-clock labelled UTC.
 *
 * The scraper builds every timestamp with `Date.UTC` from the hour the Prose
 * Consult page displays (`apps/scraper/src/parser/hours.ts`), so a course at
 * 10h00 Paris lands in the database as `10:00:00Z`. It is a *label*, not an
 * instant: reading it back with the UTC getters gives the hour a student
 * actually sees, which is why the api formats it that way and `lib/ical.ts`
 * emits it under `TZID=Europe/Paris`.
 *
 * The consequence is that a real instant — `new Date()` — cannot be compared
 * with one of those timestamps directly; doing so is off by the Paris UTC
 * offset, one hour in winter and two in summer. Convert it first with
 * `toWallClock`, or take the current moment from `wallClockNow`.
 */

export const PLANNING_TZ = 'Europe/Paris'

/**
 * Deliberately not `date.getHours()`: that reads the *process* timezone, which
 * is Europe/Paris on a developer's laptop and UTC in the api container, so the
 * comparison silently worked in dev and drifted in production.
 */
const partsFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: PLANNING_TZ,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
})

interface WallClockParts {
    year: number
    month: number
    day: number
    hour: number
    minute: number
    second: number
}

function partsOf(instant: Date): WallClockParts {
    const parts = partsFormatter.formatToParts(instant)
    const value = (type: Intl.DateTimeFormatPartTypes): number =>
        Number(parts.find((p) => p.type === type)?.value)
    return {
        year: value('year'),
        month: value('month'),
        day: value('day'),
        hour: value('hour'),
        minute: value('minute'),
        second: value('second'),
    }
}

/** A real instant, re-encoded the way planning timestamps are stored. */
export function toWallClock(instant: Date): Date {
    const { year, month, day, hour, minute, second } = partsOf(instant)
    return new Date(
        Date.UTC(year, month - 1, day, hour, minute, second, instant.getUTCMilliseconds()),
    )
}

/** Now, comparable with an event's `startDate` / `endDate`. */
export function wallClockNow(): Date {
    return toWallClock(new Date())
}

/** Midnight opening the Paris day that contains `instant`, in that encoding. */
export function wallClockDayStart(instant: Date = new Date()): Date {
    const { year, month, day } = partsOf(instant)
    return new Date(Date.UTC(year, month - 1, day))
}

/** Midnight closing it — exclusive, so pair it with a strict `<`. */
export function wallClockDayEnd(instant: Date = new Date()): Date {
    const end = wallClockDayStart(instant)
    end.setUTCDate(end.getUTCDate() + 1)
    return end
}
