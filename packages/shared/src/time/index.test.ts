import { describe, expect, it } from 'vitest'

import {
    fromWallClock,
    toWallClock,
    wallClockDayEnd,
    wallClockDayStart,
    wallClockToOffsetIso,
} from './index.js'

/**
 * A wall-clock label, written the way the scraper builds one: the hour the
 * Prose Consult page displays, encoded with `Date.UTC`.
 */
const label = (s: string) => new Date(`${s}Z`)

// Paris switches on the last Sunday of March and October, at 01:00 UTC.
const SPRING_FORWARD = '2026-03-29' // 02:00 -> 03:00, the 02:xx hour does not exist
const FALL_BACK = '2026-10-25' // 03:00 -> 02:00, the 02:xx hour happens twice

describe('wallClockToOffsetIso', () => {
    it('resolves a summer label to CEST', () => {
        expect(wallClockToOffsetIso(label('2026-09-07T08:00:00.000'))).toBe(
            '2026-09-07T08:00:00.000+02:00',
        )
    })

    it('resolves a winter label to CET', () => {
        expect(wallClockToOffsetIso(label('2026-01-15T08:00:00.000'))).toBe(
            '2026-01-15T08:00:00.000+01:00',
        )
    })

    it.each([
        ['2026-01-15T08:00:00.000', '+01:00'],
        ['2026-06-30T23:30:00.000', '+02:00'],
        ['2026-09-07T08:00:00.000', '+02:00'],
        [`${SPRING_FORWARD}T01:59:00.000`, '+01:00'], // last CET minute
        [`${SPRING_FORWARD}T03:00:00.000`, '+02:00'], // first CEST hour
        [`${FALL_BACK}T01:30:00.000`, '+02:00'], // before the repeat
        [`${FALL_BACK}T03:30:00.000`, '+01:00'], // after it
    ])('%s carries offset %s and round-trips', (raw, offset) => {
        const wall = label(raw)
        const iso = wallClockToOffsetIso(wall)
        expect(iso.endsWith(offset)).toBe(true)
        // The emitted instant must read back as the label we started from,
        // which is what makes it safe to hand to a client.
        expect(toWallClock(new Date(iso)).toISOString()).toBe(wall.toISOString())
    })

    it('never emits a Z, which is the bug it exists to fix', () => {
        const iso = wallClockToOffsetIso(label('2026-09-07T08:00:00.000'))
        expect(iso).not.toContain('Z')
        // An 08:00 Paris class is 06:00 UTC in summer.
        expect(new Date(iso).toISOString()).toBe('2026-09-07T06:00:00.000Z')
    })
})

describe('fromWallClock', () => {
    it('inverts toWallClock', () => {
        const instant = new Date('2026-09-07T06:00:00.000Z')
        expect(fromWallClock(toWallClock(instant)).toISOString()).toBe(instant.toISOString())
    })

    it('resolves the repeated autumn hour to the second pass', () => {
        // 02:30 occurs twice on the fall-back day. Either answer is defensible;
        // this pins the one we ship so it cannot drift silently.
        expect(fromWallClock(label(`${FALL_BACK}T02:30:00.000`)).toISOString()).toBe(
            '2026-10-25T01:30:00.000Z',
        )
    })

    it('resolves the skipped spring hour without throwing', () => {
        // 02:30 does not exist on the spring-forward day; the planning holds no
        // such course, but a label must still map to some instant.
        expect(fromWallClock(label(`${SPRING_FORWARD}T02:30:00.000`))).toBeInstanceOf(Date)
    })

    it('preserves milliseconds', () => {
        expect(fromWallClock(label('2026-09-07T08:00:00.123')).getUTCMilliseconds()).toBe(123)
    })
})

describe('day bounds', () => {
    it('brackets the Paris day containing an instant', () => {
        // 23:30 UTC on 6 Sept is already 7 Sept in Paris (CEST).
        const instant = new Date('2026-09-06T23:30:00.000Z')
        expect(wallClockDayStart(instant).toISOString()).toBe('2026-09-07T00:00:00.000Z')
        expect(wallClockDayEnd(instant).toISOString()).toBe('2026-09-08T00:00:00.000Z')
    })
})
