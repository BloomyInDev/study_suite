import { describe, expect, it } from 'vitest'

import { DateFormatSchema } from '../schemas/query.js'
import { formatDate } from './serialize.js'

const SUMMER = new Date('2026-09-07T06:00:00.000Z') // 08:00 Paris, CEST
const WINTER = new Date('2026-01-15T07:00:00.000Z') // 08:00 Paris, CET

/** Every format, as ms since the epoch, so they can be compared to each other. */
const asMillis = (d: Date, fmt: ReturnType<typeof DateFormatSchema.parse>): number => {
    const out = formatDate(d, fmt)
    if (typeof out === 'number') return fmt.startsWith('unix-ms') ? out : out * 1000
    return new Date(out).getTime()
}

describe('formatDate', () => {
    const formats = DateFormatSchema.removeDefault().options

    it('offers exactly the formats the enum advertises', () => {
        expect(formats).toEqual([
            'iso',
            'iso-offset',
            'unix',
            'unix-ms',
            'unix-instant',
            'unix-ms-instant',
        ])
        expect(DateFormatSchema.parse(undefined)).toBe('iso')
    })

    it.each([
        ['summer', SUMMER],
        ['winter', WINTER],
    ])('every format is the same instant: %s', (_name, instant) => {
        for (const fmt of formats) expect(asMillis(instant, fmt)).toBe(instant.getTime())
    })

    it('iso is UTC and means it', () => {
        expect(formatDate(SUMMER, 'iso')).toBe('2026-09-07T06:00:00.000Z')
        expect(formatDate(WINTER, 'iso')).toBe('2026-01-15T07:00:00.000Z')
    })

    it('iso-offset shows the hour on the planning, with the offset of the season', () => {
        expect(formatDate(SUMMER, 'iso-offset')).toBe('2026-09-07T08:00:00.000+02:00')
        expect(formatDate(WINTER, 'iso-offset')).toBe('2026-01-15T08:00:00.000+01:00')
    })

    it('emits seconds for unix and milliseconds for unix-ms', () => {
        expect(formatDate(SUMMER, 'unix-ms')).toBe((formatDate(SUMMER, 'unix') as number) * 1000)
    })
})
