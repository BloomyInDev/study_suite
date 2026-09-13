import { afterEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_PAST_DAYS, defaultCalendarFrom } from './calendar-window.js'

const DAY_MS = 24 * 60 * 60 * 1000

/** A real instant, and the Paris offset in force at it. */
const SUMMER = { instant: new Date('2026-09-07T08:00:00.000Z'), offsetMin: 120 } // CEST, 10h00 Paris
const WINTER = { instant: new Date('2026-01-15T09:00:00.000Z'), offsetMin: 60 } //  CET,  10h00 Paris

afterEach(() => {
    vi.useRealTimers()
})

describe('defaultCalendarFrom', () => {
    // The bug this guards: the feed's lower bound is compared against
    // `events.startDate`, a wall-clock label. Deriving it from `Date.now()`
    // yields a real instant, so the 60-day cutoff sat one or two hours off and
    // silently included or dropped the events on the boundary.
    it.each([
        ['summer (CEST)', SUMMER],
        ['winter (CET)', WINTER],
    ])('is a wall-clock label, not an instant — %s', (_label, { instant, offsetMin }) => {
        vi.useFakeTimers()
        vi.setSystemTime(instant)

        const naive = new Date(instant.getTime() - DEFAULT_PAST_DAYS * DAY_MS)

        // Exactly the Paris offset ahead of the instant-based value it replaced.
        expect(defaultCalendarFrom().getTime() - naive.getTime()).toBe(offsetMin * 60_000)
    })

    it.each([
        ['summer (CEST)', SUMMER],
        ['winter (CET)', WINTER],
    ])('reads back as the Paris wall-clock hour — %s', (_label, { instant }) => {
        vi.useFakeTimers()
        vi.setSystemTime(instant)

        // Both fixtures are 10h00 Paris, and subtracting whole days keeps the
        // hour, so the label must read 10:00 under the UTC getters in either
        // season — and under any `TZ` the process happens to run in.
        const from = defaultCalendarFrom()
        expect(from.getUTCHours()).toBe(10)
        expect(from.getUTCMinutes()).toBe(0)
    })

    it('reaches exactly DEFAULT_PAST_DAYS back from the label it is given', () => {
        const now = new Date('2026-09-07T10:00:00.000Z') // already a label
        expect(defaultCalendarFrom(now).toISOString()).toBe('2026-07-09T10:00:00.000Z')
    })
})
