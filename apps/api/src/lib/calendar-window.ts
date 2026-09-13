import { wallClockNow } from '@studysuite/shared/time'

/**
 * How far back the iCal feed reaches when no explicit `from` is given. Calendar
 * clients re-fetch the whole document, so an unbounded history would grow the
 * payload every week for events nobody looks at any more.
 */
export const DEFAULT_PAST_DAYS = 60

/**
 * The feed's default lower bound, as a Paris wall-clock label.
 *
 * It is compared against `events.startDate`, which is a label and not an
 * instant (see the Time section of AGENTS.md), so it has to be derived from
 * `wallClockNow()`. Building it from `Date.now()` — which is what this did —
 * puts the cutoff one or two hours off depending on the season, silently
 * including or dropping the events sitting on the boundary.
 *
 * Subtracting whole days from a label stays in label space: both sides carry
 * the same offset, so it cancels.
 */
export function defaultCalendarFrom(now: Date = wallClockNow()): Date {
    return new Date(now.getTime() - DEFAULT_PAST_DAYS * 24 * 60 * 60 * 1000)
}
