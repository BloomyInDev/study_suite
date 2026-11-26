import { describe, expect, it } from 'vitest'

import type { AdeEvent } from '../ade/events.js'
import { departmentOf, homeDepartment, parseResourceMap, planBatches } from '../ade/resource-map.js'
import { mergeBatches } from './merge.js'

const event = (adeId: number, groups: string[], start = '2026-12-01T07:00:00Z'): AdeEvent => ({
    adeId,
    title: `Cours ${adeId}`,
    startDate: new Date(start),
    endDate: new Date(new Date(start).getTime() + 3_600_000),
    rooms: [],
    teachers: [],
    groups: groups.map((internalName) => ({ internalName })),
    color: null,
})

describe('departmentOf', () => {
    it.each([
        ['Iutm > Iutm > GEII > LP ASI > LP ASI GrA', 'GEII'],
        ['Iutm > Informatique > BUT Informatique > S1', 'Informatique'],
        ['Iutm > Iutm > Iutm > TC > BUT 1 TC FI', 'TC'],
        // The app garbles accents in its own tree; both spellings must agree.
        ['Iutm > Iutm > G?nie bio > BUT GB', 'Genie bio'],
        ['Iutm > Iutm > Génie bio > BUT GB', 'Genie bio'],
        ['Iutm > Iutm > Chimie S?te > S1', 'Chimie Sete'],
    ])('reads %s as %s', (path, department) => {
        expect(departmentOf(path)).toBe(department)
    })
})

describe('parseResourceMap', () => {
    it('takes string ids as the toolkit writes them', () => {
        expect(
            parseResourceMap([{ id: '481', path: 'Iutm > Iutm > GEA > BUT 3', name: 'BUT 3' }]),
        ).toEqual([{ id: 481, department: 'GEA' }])
    })
})

describe('planBatches', () => {
    const map = [
        ...Array.from({ length: 65 }, (_, k) => ({ id: 1000 + k, department: 'GEII' })),
        { id: 1, department: 'Informatique' },
        { id: 2, department: 'Informatique' },
    ]

    it('batches per department, at most `max` resources each', () => {
        const batches = planBatches([], map, 60)
        expect(batches.map((b) => [b.department, b.resources.length])).toEqual([
            ['GEII', 60],
            ['GEII', 5],
            ['Informatique', 2],
        ])
    })

    it('keeps the session resources the map does not know, under no department', () => {
        const batches = planBatches([1, 9999], map, 60)
        expect(batches[0]).toEqual({ department: 'Informatique', resources: [1, 2] })
        expect(batches).toContainEqual({ department: null, resources: [9999] })
    })

    it('finds the home department from the session resources', () => {
        expect(homeDepartment([1, 2, 1000], map)).toBe('Informatique')
        expect(homeDepartment([1, 2], [])).toBe(null)
    })
})

describe('mergeBatches', () => {
    it('keeps bare names for an event the home department sees', () => {
        const [e] = mergeBatches(
            [
                { department: 'Informatique', events: [event(1, ['S1'])] },
                { department: 'GEII', events: [event(1, ['S1'])] },
            ],
            'Informatique',
        )
        expect(e!.groups).toEqual([{ internalName: 'S1' }])
    })

    it('qualifies the groups of an event only another department sees', () => {
        const [e] = mergeBatches(
            [
                { department: 'Informatique', events: [] },
                { department: 'GEII', events: [event(2, ['S1'])] },
            ],
            'Informatique',
        )
        expect(e!.groups).toEqual([{ internalName: 'S1 (GEII)', displayName: 'S1' }])
    })

    it('names a group shared by two other departments after the first alphabetically', () => {
        const events = mergeBatches(
            [
                { department: 'Génie bio', events: [event(3, ['Classe Virtuelle'])] },
                { department: 'GEII', events: [event(3, ['Classe Virtuelle'])] },
            ],
            'Informatique',
        )
        expect(events).toHaveLength(1)
        expect(events[0]!.groups[0]!.internalName).toBe('Classe Virtuelle (GEII)')
    })

    it('merges one event fetched by two batches, and keeps its days apart', () => {
        const events = mergeBatches(
            [
                {
                    department: 'GEII',
                    events: [event(4, ['A']), event(4, ['A'], '2026-12-02T07:00:00Z')],
                },
                { department: 'GEII', events: [event(4, ['B'])] },
            ],
            'Informatique',
        )
        expect(events.map((e) => e.groups.map((g) => g.internalName))).toEqual([
            ['A (GEII)', 'B (GEII)'],
            ['A (GEII)'],
        ])
        expect(events.every((e) => !('adeId' in e))).toBe(true)
    })

    it('leaves names alone when there is no map', () => {
        const [e] = mergeBatches([{ department: null, events: [event(5, ['Q4'])] }], null)
        expect(e!.groups).toEqual([{ internalName: 'Q4' }])
    })
})
