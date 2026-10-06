import { describe, expect, it } from 'vitest'

import { buildCalendar, type CalendarEvent } from './ical.js'

const event = (startDate: string, endDate: string): CalendarEvent => ({
    id: 'e1',
    title: 'Bases de la comm.',
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    rooms: [],
    teachers: [],
    groups: [],
})

const lines = (e: CalendarEvent) =>
    buildCalendar([e], { name: 'Planning', domain: 'example.test' }).split('\r\n')

describe('buildCalendar', () => {
    // Must hold under any `TZ`: the api container runs in UTC, and reading the
    // hour with the local getters there would publish 08h00 as 06h00.
    it.each([
        ['summer', '2026-10-06T06:00:00.000Z', '2026-10-06T07:30:00.000Z', '20261006T080000'],
        ['winter', '2026-01-15T07:00:00.000Z', '2026-01-15T08:30:00.000Z', '20260115T080000'],
    ])('writes the Paris hour under TZID, %s', (_name, start, end, stamp) => {
        const out = lines(event(start, end))
        expect(out).toContain(`DTSTART;TZID=Europe/Paris:${stamp}`)
        expect(out.some((l) => l.startsWith('DTEND;TZID=Europe/Paris:'))).toBe(true)
        expect(out).toContain('BEGIN:VTIMEZONE')
    })

    it('puts a course after 22h UTC on the Paris day it belongs to', () => {
        const out = lines(event('2026-09-06T22:30:00.000Z', '2026-09-06T23:30:00.000Z'))
        expect(out).toContain('DTSTART;TZID=Europe/Paris:20260907T003000')
    })

    it('keeps DTSTAMP in UTC', () => {
        const stamp = lines(event('2026-10-06T06:00:00.000Z', '2026-10-06T07:30:00.000Z')).find(
            (l) => l.startsWith('DTSTAMP:'),
        )
        expect(stamp).toMatch(/^DTSTAMP:\d{8}T\d{6}Z$/)
    })
})
