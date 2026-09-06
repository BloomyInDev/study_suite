import { describe, expect, it } from 'vitest'

import { DateFormatSchema } from '../schemas/query.js'
import { formatDate } from './serialize.js'

/** A wall-clock label: the hour the planning displays, encoded with `Date.UTC`. */
const label = (s: string) => new Date(`${s}Z`)

const SUMMER = label('2026-09-07T08:00:00.000') // 08:00 Paris, CEST
const WINTER = label('2026-01-15T08:00:00.000') // 08:00 Paris, CET

/** Every format, as ms since the epoch, so they can be compared to each other. */
const asMillis = (d: Date, fmt: ReturnType<typeof DateFormatSchema.parse>): number => {
    const out = formatDate(d, fmt)
    if (typeof out === 'number') return fmt.startsWith('unix-ms') ? out : out * 1000
    return new Date(out).getTime()
}

describe('formatDate', () => {
    it('offers exactly the formats the enum advertises', () => {
        expect(DateFormatSchema.removeDefault().options).toEqual([
            'iso',
            'iso-offset',
            'unix',
            'unix-ms',
            'unix-instant',
            'unix-ms-instant',
        ])
        expect(DateFormatSchema.parse(undefined)).toBe('iso')
    })

    describe('the honest formats agree on the instant', () => {
        it.each([
            [SUMMER, '2026-09-07T06:00:00.000Z'],
            [WINTER, '2026-01-15T07:00:00.000Z'],
        ])('%s', (wall, expected) => {
            const truth = new Date(expected).getTime()
            expect(asMillis(wall, 'iso-offset')).toBe(truth)
            expect(asMillis(wall, 'unix-instant')).toBe(truth)
            expect(asMillis(wall, 'unix-ms-instant')).toBe(truth)
        })
    })

    describe('the legacy formats stay wrong by exactly the Paris offset', () => {
        // Not an aspiration — a regression guard. Correcting these in place
        // would silently break apps/web and every existing consumer.
        it.each([
            ['summer', SUMMER, 2],
            ['winter', WINTER, 1],
        ])('%s: off by %ih', (_name, wall, hours) => {
            const truth = asMillis(wall, 'iso-offset')
            const drift = hours * 3600_000
            expect(asMillis(wall, 'iso') - truth).toBe(drift)
            expect(asMillis(wall, 'unix') - truth).toBe(drift)
            expect(asMillis(wall, 'unix-ms') - truth).toBe(drift)
        })

        it('iso still ends in Z', () => {
            expect(formatDate(SUMMER, 'iso')).toBe('2026-09-07T08:00:00.000Z')
        })
    })

    it('emits seconds for unix and milliseconds for unix-ms', () => {
        expect(formatDate(SUMMER, 'unix-ms-instant')).toBe(
            (formatDate(SUMMER, 'unix-instant') as number) * 1000,
        )
    })
})
