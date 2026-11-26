import { describe, expect, it } from 'vitest'

import { toEvents } from './events.js'
import type { SquareEvent } from './planning.js'

const PATH = 'Montpellier / IUT Montpellier - Sète : Site de Mtp / K / 1'
const columns = ['2026-09-28', '2026-09-29', '2026-09-30']

const square = (over: Partial<SquareEvent> = {}): SquareEvent => ({
    eventId: 1,
    lines: [
        'Communication professionnelle',
        'K018',
        PATH,
        'BAHRI   DELPHINE',
        'Q4',
        '08h00 - 09h30',
    ],
    background: '#ffe045',
    left: 0,
    width: 237,
    ...over,
})

const one = (over: Partial<SquareEvent> = {}) => {
    const events = toEvents([square(over)], columns)
    expect(events).toHaveLength(1)
    return events[0]!
}

describe('toEvents', () => {
    it('reads a whole event', () => {
        expect(one()).toEqual({
            adeId: 1,
            title: 'Communication professionnelle',
            startDate: new Date('2026-09-28T06:00:00Z'),
            endDate: new Date('2026-09-28T07:30:00Z'),
            rooms: [{ name: 'K018' }],
            teachers: [{ lastName: 'BAHRI', firstName: 'Delphine' }],
            groups: [{ internalName: 'Q4' }],
            color: '#ffe045',
        })
    })

    it.each([
        ['2026-09-28', '2026-09-28T06:00:00Z'],
        ['2026-12-14', '2026-12-14T07:00:00Z'],
    ])('reads 08h00 on %s as the instant Paris means by it', (day, expected) => {
        expect(toEvents([square()], [day])[0]!.startDate).toEqual(new Date(expected))
    })

    it('places an event by its column, the border pixel included', () => {
        // Columns start one pixel early: 999 is the second day, not the first.
        expect(one({ left: 999, width: 48 }).startDate).toEqual(new Date('2026-09-29T06:00:00Z'))
        expect(one({ left: 998 - 48, width: 48 }).startDate).toEqual(
            new Date('2026-09-28T06:00:00Z'),
        )
    })

    it('refuses an event that straddles two columns rather than guess its day', () => {
        expect(() => toEvents([square({ left: 900, width: 200 })], columns)).toThrow(
            /one day column/,
        )
    })

    it('reads a box aligned on two whole columns as the same hours on both days', () => {
        // GEA BUT3: one ADE event, Tuesday and Wednesday 13h30, drawn as one box.
        const events = toEvents([square({ left: 999, width: 2000 })], columns)
        expect(events.map((e) => e.startDate)).toEqual([
            new Date('2026-09-29T06:00:00Z'),
            new Date('2026-09-30T06:00:00Z'),
        ])
        expect(events.every((e) => e.adeId === 1)).toBe(true)
    })

    it('splits an event that changes room mid-way at its second hours line', () => {
        const events = toEvents(
            [
                square({
                    lines: [
                        'R5.GC2F.09 Fiscalité',
                        'K212',
                        PATH,
                        'AUGE   AXEL',
                        'BUT3 FA - GC2F',
                        '08h00 - 10h00',
                        'K211',
                        '10h00 - 12h00',
                    ],
                }),
            ],
            columns,
        )
        expect(events.map((e) => [e.startDate, e.endDate, e.rooms])).toEqual([
            [
                new Date('2026-09-28T06:00:00Z'),
                new Date('2026-09-28T08:00:00Z'),
                [{ name: 'K212' }],
            ],
            [
                new Date('2026-09-28T08:00:00Z'),
                new Date('2026-09-28T10:00:00Z'),
                [{ name: 'K211' }],
            ],
        ])
        for (const e of events) {
            expect(e.teachers).toEqual([{ lastName: 'AUGE', firstName: 'Axel' }])
            expect(e.groups).toEqual([{ internalName: 'BUT3 FA - GC2F' }])
        }
    })

    it('adds rooms printed after the last hours line to the event', () => {
        // Mesures Physiques: `… Groupe B | 08h00 - 09h30 | B009 TD`.
        const e = one({
            lines: [
                'Env. Sévère TD B',
                'B014 TD',
                PATH,
                'AUGEREAU   FRANCK',
                'Groupe B',
                '08h00 - 09h30',
                'B009 TD',
                PATH,
            ],
        })
        expect(e.rooms).toEqual([{ name: 'B014 TD' }, { name: 'B009 TD' }])
        expect(e.groups).toEqual([{ internalName: 'Groupe B' }])
        expect(e.endDate).toEqual(new Date('2026-09-28T07:30:00Z'))
    })

    it('keeps one event for several drawings of the same ADE event', () => {
        // `Tutorat` is drawn once per group sub-column, under one id.
        const events = toEvents(
            [
                square({ eventId: 7, left: 0 }),
                square({ eventId: 7, left: 48 }),
                square({ eventId: 8, left: 96 }),
            ],
            columns,
        )
        expect(events.map((e) => e.adeId)).toEqual([7, 8])
    })

    it('drops the empty line the planning leaves where a path would go', () => {
        const e = one({
            lines: [
                'Gestion proj. orga.',
                'Cours en ligne (CEL) IUTMS',
                '',
                'CHOLLET   ANTOINE',
                'A1-Semestre-1',
                '08h00 - 09h30',
            ],
        })
        expect(e.rooms).toEqual([{ name: 'Cours en ligne (CEL) IUTMS' }])
        expect(e.groups).toEqual([{ internalName: 'A1-Semestre-1' }])
    })

    it('reads a trailing room without its path line as a room when it is known as one', () => {
        // No teacher: the boundary falls after the last path line, so K131
        // would read as a group, but another event names it with its path.
        const events = toEvents(
            [
                square({
                    eventId: 1,
                    lines: ['Tutorat', 'K116', PATH, 'K131', 'S4', '17h30 - 18h30'],
                }),
                square({
                    eventId: 2,
                    left: 48,
                    lines: ['Réunion', 'K131', PATH, 'X   Y', 'S1', '10h00 - 11h00'],
                }),
            ],
            columns,
        )
        expect(events[0]!.rooms).toEqual([{ name: 'K116' }, { name: 'K131' }])
        expect(events[0]!.groups).toEqual([{ internalName: 'S4' }])
    })

    // The separator is three spaces; collapsing it turns every teacher into a
    // student group.
    describe('teacher lines', () => {
        it.each([
            ['PALLEJA   NATHALIE', { lastName: 'PALLEJA', firstName: 'Nathalie' }],
            ['MAZARS CHAPELON   AGNES', { lastName: 'MAZARS CHAPELON', firstName: 'Agnes' }],
            ["D'ORAZIO   JEAN-LUC", { lastName: "D'ORAZIO", firstName: 'Jean-Luc' }],
            // As the page used to render it, with non-breaking spaces.
            [
                'RIOS\u00a0SOLIS\u00a0\u00a0\u00a0YASMIN AGUEDA',
                { lastName: 'RIOS SOLIS', firstName: 'Yasmin Agueda' },
            ],
        ])('splits %s on the three-space separator', (line, expected) => {
            const e = one({ lines: ['X', 'K018', PATH, line, 'Q4', '08h00 - 09h30'] })
            expect(e.teachers).toEqual([expected])
            expect(e.groups).toEqual([{ internalName: 'Q4' }])
        })
    })

    it('refuses an event with no hours line', () => {
        expect(() => toEvents([square({ lines: ['Titre', 'K018'] })], columns)).toThrow(
            /no hours line/,
        )
    })
})
