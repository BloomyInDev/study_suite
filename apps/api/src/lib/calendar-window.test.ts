import { afterEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_PAST_DAYS, defaultCalendarFrom } from './calendar-window.js'

const DAY_MS = 24 * 60 * 60 * 1000

afterEach(() => {
    vi.useRealTimers()
})

describe('defaultCalendarFrom', () => {
    it.each([
        ['summer (CEST)', new Date('2026-09-07T08:00:00.000Z')],
        ['winter (CET)', new Date('2026-01-15T09:00:00.000Z')],
    ])('reaches exactly DEFAULT_PAST_DAYS back from now: %s', (_label, instant) => {
        vi.useFakeTimers()
        vi.setSystemTime(instant)

        expect(defaultCalendarFrom().getTime()).toBe(instant.getTime() - DEFAULT_PAST_DAYS * DAY_MS)
    })

    it('takes the moment it is given', () => {
        const now = new Date('2026-09-07T10:00:00.000Z')
        expect(defaultCalendarFrom(now).toISOString()).toBe('2026-07-09T10:00:00.000Z')
    })
})
