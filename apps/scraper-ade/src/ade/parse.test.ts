import { describe, expect, it } from 'vitest'

import { parseCalendar } from './parse.js'

/** A calendar holding one VEVENT, folded the way ADE actually emits it. */
const calendar = (...lines: string[]) =>
    [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'BEGIN:VEVENT',
        ...lines,
        'END:VEVENT',
        'END:VCALENDAR',
    ].join('\r\n')

const one = (...lines: string[]) => {
    const events = parseCalendar(calendar(...lines))
    expect(events).toHaveLength(1)
    return events[0]!
}

describe('parseCalendar', () => {
    it('reads a whole event', () => {
        const e = one(
            'DTSTART:20260915T060000Z',
            'DTEND:20260915T073000Z',
            'SUMMARY:Communication professionnelle',
            'LOCATION:K018',
            'DESCRIPTION:\\n\\nQ4\\nBAHRI   DELPHINE\\nA valider\\n(Exported :13/09/2026 15:55)\\n',
            'UID:ADE-1',
        )
        expect(e.title).toBe('Communication professionnelle')
        expect(e.rooms).toEqual([{ name: 'K018' }])
        expect(e.teachers).toEqual([{ lastName: 'BAHRI', firstName: 'Delphine' }])
        expect(e.groups).toEqual([{ internalName: 'Q4' }])
    })

    // The bug this guards: collapsing the DESCRIPTION's inner whitespace
    // destroys the three-space separator, and every teacher silently becomes a
    // student group.
    describe('teacher lines', () => {
        const teacherOf = (line: string) =>
            one(
                'DTSTART:20260915T060000Z',
                'DTEND:20260915T073000Z',
                'SUMMARY:X',
                'LOCATION:K018',
                `DESCRIPTION:\\n\\nQ4\\n${line}\\n`,
                'UID:ADE-1',
            )

        it.each([
            ['PALLEJA   NATHALIE', { lastName: 'PALLEJA', firstName: 'Nathalie' }],
            ['MAZARS CHAPELON   AGNES', { lastName: 'MAZARS CHAPELON', firstName: 'Agnes' }],
            ['MARIE JEANNE   ALAIN', { lastName: 'MARIE JEANNE', firstName: 'Alain' }],
            ["D'ORAZIO   JEAN-LUC", { lastName: "D'ORAZIO", firstName: 'Jean-Luc' }],
        ])('splits %s on the three-space separator', (line, expected) => {
            const e = teacherOf(line)
            expect(e.teachers).toEqual([expected])
            expect(e.groups).toEqual([{ internalName: 'Q4' }])
        })

        it('keeps the title case the database already stores', () => {
            // `relationsKey` keys teachers on `lastName:firstName`, so handing
            // reconciliation "NATHALIE" would churn every teacher on the planning.
            expect(teacherOf('PALLEJA   NATHALIE').teachers[0]!.firstName).toBe('Nathalie')
        })
    })

    // Not a regression guard like the one above: it pins the shape ADE uses
    // for the 40-odd multi-room events, which the DOM showed as separate lines.
    it('splits a multi-room LOCATION on the escaped comma', () => {
        const e = one(
            'DTSTART:20260916T123000Z',
            'DTEND:20260916T153000Z',
            'SUMMARY:Intro B.D.',
            'LOCATION:K041\\,K131',
            'DESCRIPTION:\\n\\nS4\\nPALLEJA   XAVIER\\n',
            'UID:ADE-1',
        )
        expect(e.rooms).toEqual([{ name: 'K041' }, { name: 'K131' }])
    })

    it('keeps a room name that is not a list intact', () => {
        const e = one(
            'DTSTART:20260914T060000Z',
            'DTEND:20260914T073000Z',
            'SUMMARY:Gestion proj. orga.',
            'LOCATION:Cours en ligne (CEL) IUTMS',
            'DESCRIPTION:\\n\\nA1-Semestre-1\\n',
            'UID:ADE-1',
        )
        expect(e.rooms).toEqual([{ name: 'Cours en ligne (CEL) IUTMS' }])
    })

    // DTSTART is a real instant; `events.start_date` is a Paris wall-clock
    // label. Writing the instant through shifts every course by the offset.
    it.each([
        ['summer (CEST)', '20260915T060000Z', '20260915T073000Z', 8, 9],
        ['winter (CET)', '20260115T090000Z', '20260115T103000Z', 10, 11],
    ])('stores Paris wall-clock labels: %s', (_l, dtstart, dtend, startHour, endHour) => {
        const e = one(
            `DTSTART:${dtstart}`,
            `DTEND:${dtend}`,
            'SUMMARY:X',
            'LOCATION:K018',
            'DESCRIPTION:\\n\\nQ4\\n',
            'UID:ADE-1',
        )
        expect(e.startDate.getUTCHours()).toBe(startHour)
        expect(e.endDate.getUTCHours()).toBe(endHour)
        expect(e.endDate.getUTCMinutes()).toBe(30)
    })

    it('drops ADE status and bookkeeping lines', () => {
        const e = one(
            'DTSTART:20260915T060000Z',
            'DTEND:20260915T073000Z',
            'SUMMARY:SAE 3.01',
            'LOCATION:K033',
            'DESCRIPTION:\\n\\nQ4\\nA valider\\nBUDZYNSKI   PAUL\\n(Exported :13/09/2026 15:55)\\n',
            'UID:ADE-1',
        )
        expect(e.groups).toEqual([{ internalName: 'Q4' }])
        expect(e.teachers).toEqual([{ lastName: 'BUDZYNSKI', firstName: 'Paul' }])
    })

    it('unfolds continuation lines', () => {
        const e = one(
            'DTSTART:20260915T060000Z',
            'DTEND:20260915T073000Z',
            'SUMMARY:Installation et Configuration de services\r\n  complexes',
            'LOCATION:K119',
            'DESCRIPTION:\\n\\nG3\\n',
            'UID:ADE-1',
        )
        expect(e.title).toBe('Installation et Configuration de services complexes')
    })

    it('ignores an event with no parsable times', () => {
        expect(parseCalendar(calendar('SUMMARY:X', 'LOCATION:K018'))).toEqual([])
    })
})
