/**
 * The planning's calendar, read in Europe/Paris.
 *
 * Every event timestamp is a real instant: the scrapers resolve the hour the
 * planning displays through `parisDate`, so a course at 10h00 Paris in summer
 * is stored as `08:00:00Z` and compares with `new Date()` directly.
 *
 * What still needs care is the *calendar*: which day an instant falls on, where
 * a week starts, what "the same hour tomorrow" is. Those are Paris questions,
 * and the helpers below are the only place they are answered. The `Date`
 * getters cannot: the local ones read the process timezone and the UTC ones put
 * a 00h30 course on the previous day.
 */

export const PLANNING_TZ = 'Europe/Paris'

/**
 * Deliberately not `date.getHours()`: that reads the *process* timezone, which
 * is Europe/Paris on a developer's laptop and UTC in the api container, so the
 * result silently worked in dev and drifted in production.
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

export interface ParisParts {
    year: number
    /** 1 to 12. */
    month: number
    day: number
    hour: number
    minute: number
    second: number
    /** 0 = Sunday, like `Date.prototype.getDay`. */
    weekday: number
}

/** What a clock and a calendar on a Paris wall show at `instant`. */
export function parisParts(instant: Date): ParisParts {
    const parts = partsFormatter.formatToParts(instant)
    const value = (type: Intl.DateTimeFormatPartTypes): number =>
        Number(parts.find((p) => p.type === type)?.value)
    const year = value('year')
    const month = value('month')
    const day = value('day')
    return {
        year,
        month,
        day,
        hour: value('hour'),
        minute: value('minute'),
        second: value('second'),
        weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
    }
}

/** The Europe/Paris offset, in minutes east of UTC, at a real instant. */
function offsetMinutesAt(instant: Date): number {
    const { year, month, day, hour, minute, second } = parisParts(instant)
    const shown = Date.UTC(year, month - 1, day, hour, minute, second)
    return Math.round((shown - instant.getTime()) / 60000)
}

/**
 * The instant at which a Paris wall shows the given date and hour. `month` is
 * 1 to 12, and the fields overflow the way `Date.UTC`'s do, so day 32 is the
 * 1st of the next month.
 *
 * The offset depends on the instant, which is what we are solving for, so the
 * fields are first read as if they were UTC to get a candidate offset, then the
 * result is re-measured once: within an hour of a DST transition the first
 * guess lands on the wrong side of it and the second pass corrects that.
 */
export function parisDate(
    year: number,
    month: number,
    day: number,
    hour = 0,
    minute = 0,
    second = 0,
): Date {
    const shown = Date.UTC(year, month - 1, day, hour, minute, second)
    const guess = new Date(shown - offsetMinutesAt(new Date(shown)) * 60000)
    return new Date(shown - offsetMinutesAt(guess) * 60000)
}

/** Midnight opening the Paris day that contains `instant`. */
export function parisDayStart(instant: Date = new Date()): Date {
    const { year, month, day } = parisParts(instant)
    return parisDate(year, month, day)
}

/** The midnight closing it. Exclusive, so pair it with a strict `<`. */
export function parisDayEnd(instant: Date = new Date()): Date {
    const { year, month, day } = parisParts(instant)
    return parisDate(year, month, day + 1)
}

/**
 * The same Paris hour, `days` days later. Not `+ days * 24h`: the day a clock
 * changes is 23 or 25 hours long, and adding milliseconds across it lands an
 * hour off.
 */
export function addParisDays(instant: Date, days: number): Date {
    const { year, month, day, hour, minute, second } = parisParts(instant)
    return parisDate(year, month, day + days, hour, minute, second)
}

/** Monday 00h00 of the Paris week that contains `instant`. A Sunday closes its week. */
export function parisWeekStart(instant: Date = new Date()): Date {
    const { year, month, day, weekday } = parisParts(instant)
    return parisDate(year, month, day - ((weekday + 6) % 7))
}

const pad = (n: number, width = 2): string => String(n).padStart(width, '0')

/** The Paris day of `instant` as `YYYY-MM-DD`. */
export function parisDayKey(instant: Date): string {
    const { year, month, day } = parisParts(instant)
    return `${pad(year, 4)}-${pad(month)}-${pad(day)}`
}

/** The inverse of `parisDayKey`: the midnight opening a `YYYY-MM-DD` Paris day. */
export function parisDayFromKey(key: string): Date {
    const [year, month, day] = key.split('-').map(Number) as [number, number, number]
    return parisDate(year, month, day)
}

/**
 * An instant as an RFC 3339 timestamp carrying the Paris offset:
 * `2026-09-07T08:00:00.000+02:00`. The same instant as `toISOString()`, spelled
 * so that the hour a student reads is the one in the string.
 */
export function toParisOffsetIso(instant: Date): string {
    const offset = offsetMinutesAt(instant)
    const sign = offset < 0 ? '-' : '+'
    const abs = Math.abs(offset)
    const shown = new Date(instant.getTime() + offset * 60000)
    // `slice(0, 23)` keeps `YYYY-MM-DDTHH:mm:ss.sss`, dropping only the `Z`.
    return `${shown.toISOString().slice(0, 23)}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}

/** `2026-09-07T08:00:00Z`, `...+02:00`, `...+0200`: a timestamp that names its own offset. */
const HAS_OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/i
const LOCAL_STAMP = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/

/**
 * Parses a timestamp a client sent. One that carries `Z` or an offset is the
 * instant it says. One that does not (`2026-09-07`, `2026-09-07T08:00`) is a
 * Paris date or hour: `new Date()` would read the first as UTC midnight and the
 * second in the process timezone. Returns null for anything else.
 */
export function parseInstant(text: string): Date | null {
    const s = text.trim()
    if (HAS_OFFSET.test(s)) {
        const d = new Date(s)
        return Number.isNaN(d.getTime()) ? null : d
    }
    const m = LOCAL_STAMP.exec(s)
    if (!m) return null
    const d = parisDate(
        Number(m[1]),
        Number(m[2]),
        Number(m[3]),
        Number(m[4] ?? 0),
        Number(m[5] ?? 0),
        Number(m[6] ?? 0),
    )
    return Number.isNaN(d.getTime()) ? null : d
}
