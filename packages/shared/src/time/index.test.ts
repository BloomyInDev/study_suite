import { describe, expect, it } from 'vitest'

import {
    addParisDays,
    parisDate,
    parisDayEnd,
    parisDayFromKey,
    parisDayKey,
    parisDayStart,
    parisParts,
    parisWeekStart,
    parseInstant,
    toParisOffsetIso,
} from './index.js'

// Everything here must pass under any `TZ`.

// Paris switches on the last Sunday of March and October, at 01:00 UTC.
const SPRING_FORWARD = [2026, 3, 29] as const // 02:00 -> 03:00, the 02:xx hour does not exist
const FALL_BACK = [2026, 10, 25] as const // 03:00 -> 02:00, the 02:xx hour happens twice

describe('parisDate', () => {
    it('resolves a summer hour through CEST', () => {
        expect(parisDate(2026, 9, 7, 8).toISOString()).toBe('2026-09-07T06:00:00.000Z')
    })

    it('resolves a winter hour through CET', () => {
        expect(parisDate(2026, 1, 15, 8).toISOString()).toBe('2026-01-15T07:00:00.000Z')
    })

    it.each([
        [[...SPRING_FORWARD, 1, 59], '2026-03-29T00:59:00.000Z'], // last CET minute
        [[...SPRING_FORWARD, 3, 0], '2026-03-29T01:00:00.000Z'], // first CEST hour
        [[...FALL_BACK, 1, 30], '2026-10-24T23:30:00.000Z'], // before the repeat
        [[...FALL_BACK, 3, 30], '2026-10-25T02:30:00.000Z'], // after it
    ] as const)('%j is %s', ([y, mo, d, h, mi], expected) => {
        expect(parisDate(y, mo, d, h, mi).toISOString()).toBe(expected)
    })

    it('resolves the repeated autumn hour to the second pass', () => {
        // 02:30 occurs twice on the fall-back day. Either answer is defensible;
        // this pins the one we ship so it cannot drift silently.
        expect(parisDate(...FALL_BACK, 2, 30).toISOString()).toBe('2026-10-25T01:30:00.000Z')
    })

    it('resolves the skipped spring hour without throwing', () => {
        // 02:30 does not exist on the spring-forward day; the planning holds no
        // such course, but the fields must still map to some instant.
        expect(Number.isNaN(parisDate(...SPRING_FORWARD, 2, 30).getTime())).toBe(false)
    })

    it('overflows the day like Date.UTC', () => {
        expect(parisDate(2026, 9, 31).toISOString()).toBe(parisDate(2026, 10, 1).toISOString())
    })
})

describe('parisParts', () => {
    it('inverts parisDate', () => {
        expect(parisParts(parisDate(2026, 9, 7, 8, 30))).toEqual({
            year: 2026,
            month: 9,
            day: 7,
            hour: 8,
            minute: 30,
            second: 0,
            weekday: 1,
        })
    })

    it('puts a late UTC evening on the Paris day it belongs to', () => {
        // 23:30 UTC on Sunday 6 Sept is already Monday 7 Sept in Paris (CEST).
        const parts = parisParts(new Date('2026-09-06T23:30:00.000Z'))
        expect([parts.day, parts.hour, parts.weekday]).toEqual([7, 1, 1])
    })
})

describe('day bounds', () => {
    it('brackets the Paris day containing an instant', () => {
        const instant = new Date('2026-09-06T23:30:00.000Z')
        expect(parisDayStart(instant).toISOString()).toBe('2026-09-06T22:00:00.000Z')
        expect(parisDayEnd(instant).toISOString()).toBe('2026-09-07T22:00:00.000Z')
    })

    it('makes the fall-back day 25 hours long and the spring-forward one 23', () => {
        const hours = (y: number, m: number, d: number) => {
            const noon = parisDate(y, m, d, 12)
            return (parisDayEnd(noon).getTime() - parisDayStart(noon).getTime()) / 3_600_000
        }
        expect(hours(...FALL_BACK)).toBe(25)
        expect(hours(...SPRING_FORWARD)).toBe(23)
    })

    it('round-trips a day key', () => {
        expect(parisDayKey(new Date('2026-09-06T23:30:00.000Z'))).toBe('2026-09-07')
        expect(parisDayFromKey('2026-09-07').toISOString()).toBe('2026-09-06T22:00:00.000Z')
    })
})

describe('parisWeekStart', () => {
    it('is the Monday midnight of the Paris week', () => {
        // Wednesday 9 Sept.
        expect(parisWeekStart(parisDate(2026, 9, 9, 14)).toISOString()).toBe(
            '2026-09-06T22:00:00.000Z',
        )
    })

    it('reads a Sunday as the end of its week, not the start of the next', () => {
        expect(parisDayKey(parisWeekStart(parisDate(2026, 9, 13, 23)))).toBe('2026-09-07')
    })

    it('reads Monday 00h30 as that Monday, which the UTC getters put on the Sunday', () => {
        expect(parisDayKey(parisWeekStart(parisDate(2026, 9, 7, 0, 30)))).toBe('2026-09-07')
    })
})

describe('addParisDays', () => {
    it('keeps the hour across both clock changes', () => {
        // The week holding each transition: Monday 08h00 to the next Monday 08h00.
        for (const [y, m, d] of [
            [2026, 3, 23],
            [2026, 10, 19],
        ] as const) {
            const next = parisParts(addParisDays(parisDate(y, m, d, 8), 7))
            expect([next.day, next.hour, next.weekday]).toEqual([d + 7, 8, 1])
        }
    })

    it('goes backwards too', () => {
        expect(parisDayKey(addParisDays(parisDate(2026, 3, 30, 8), -7))).toBe('2026-03-23')
    })
})

describe('toParisOffsetIso', () => {
    it.each([
        ['2026-09-07T06:00:00.000Z', '2026-09-07T08:00:00.000+02:00'],
        ['2026-01-15T07:00:00.000Z', '2026-01-15T08:00:00.000+01:00'],
        ['2026-06-30T21:30:00.123Z', '2026-06-30T23:30:00.123+02:00'],
        ['2026-03-29T00:59:00.000Z', '2026-03-29T01:59:00.000+01:00'],
        ['2026-03-29T01:00:00.000Z', '2026-03-29T03:00:00.000+02:00'],
        ['2026-10-25T00:30:00.000Z', '2026-10-25T02:30:00.000+02:00'],
        ['2026-10-25T01:30:00.000Z', '2026-10-25T02:30:00.000+01:00'],
    ])('%s is %s, the same instant', (utc, expected) => {
        const iso = toParisOffsetIso(new Date(utc))
        expect(iso).toBe(expected)
        expect(new Date(iso).toISOString()).toBe(utc)
    })
})

describe('parseInstant', () => {
    it.each([
        ['2026-09-07T06:00:00.000Z', '2026-09-07T06:00:00.000Z'],
        ['2026-09-07T08:00:00.000+02:00', '2026-09-07T06:00:00.000Z'],
        ['2026-09-07T08:00:00+0200', '2026-09-07T06:00:00.000Z'],
    ])('takes %s at its word', (text, expected) => {
        expect(parseInstant(text)?.toISOString()).toBe(expected)
    })

    it.each([
        ['2026-09-07', '2026-09-06T22:00:00.000Z'],
        ['2026-09-07T08:00', '2026-09-07T06:00:00.000Z'],
        ['2026-01-15T08:00:00', '2026-01-15T07:00:00.000Z'],
    ])('reads %s, which names no offset, in Paris', (text, expected) => {
        expect(parseInstant(text)?.toISOString()).toBe(expected)
    })

    it('rejects what is not a timestamp', () => {
        expect(parseInstant('tomorrow')).toBeNull()
        expect(parseInstant('2026-13-45T99:00:00Z')).toBeNull()
    })
})
