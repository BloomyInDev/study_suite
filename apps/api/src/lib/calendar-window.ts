/**
 * How far back the iCal feed reaches when no explicit `from` is given. Calendar
 * clients re-fetch the whole document, so an unbounded history would grow the
 * payload every week for events nobody looks at any more.
 */
export const DEFAULT_PAST_DAYS = 60

/** The feed's default lower bound, compared against `events.startDate`. */
export function defaultCalendarFrom(now: Date = new Date()): Date {
    return new Date(now.getTime() - DEFAULT_PAST_DAYS * 24 * 60 * 60 * 1000)
}
