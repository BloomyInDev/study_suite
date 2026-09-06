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

/** The Europe/Paris offset, in minutes east of UTC, at a real instant. */
function offsetMinutesAt(instant: Date): number {
    return (toWallClock(instant).getTime() - instant.getTime()) / 60000
}

/**
 * The real instant a wall-clock label denotes — the inverse of `toWallClock`.
 *
 * The offset depends on the instant, which is what we are solving for, so the
 * label is first read as if it were UTC to get a candidate offset, then the
 * result is re-measured once: within an hour of a DST transition the first
 * guess lands on the wrong side of it and the second pass corrects that.
 */
export function fromWallClock(wallClock: Date): Date {
    const guess = new Date(wallClock.getTime() - offsetMinutesAt(wallClock) * 60000)
    return new Date(wallClock.getTime() - offsetMinutesAt(guess) * 60000)
}

/**
 * A wall-clock label as an RFC 3339 timestamp carrying the real Paris offset:
 * `2026-09-07T08:00:00.000+02:00`.
 *
 * Unlike `toISOString()` on the same value, this denotes the instant a student
 * experiences, so a consumer that does date arithmetic on it gets the right
 * answer without knowing anything about how the planning is stored.
 */
export function wallClockToOffsetIso(wallClock: Date): string {
    const offset = offsetMinutesAt(fromWallClock(wallClock))
    const sign = offset < 0 ? '-' : '+'
    const abs = Math.abs(offset)
    const hh = String(Math.floor(abs / 60)).padStart(2, '0')
    const mm = String(abs % 60).padStart(2, '0')
    // `slice(0, 23)` keeps `YYYY-MM-DDTHH:mm:ss.sss`, dropping only the `Z`.
    return `${wallClock.toISOString().slice(0, 23)}${sign}${hh}:${mm}`
}
