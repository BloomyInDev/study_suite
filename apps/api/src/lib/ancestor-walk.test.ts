import { describe, expect, it } from 'vitest'

import { IncludeAncestorGroupsSchema } from '../schemas/query.js'
import { walkAncestors } from './ancestor-walk.js'

/** child → parents, as `student_group_memberships` holds it. */
function hierarchy(links: Record<string, string[]>) {
    const calls: string[][] = []
    const parentsOf = async (childIds: string[]) => {
        calls.push(childIds)
        return childIds.flatMap((id) => links[id] ?? [])
    }
    return { parentsOf, calls }
}

describe('walkAncestors', () => {
    const TREE = { S1a: ['S1'], S1b: ['S1'], S1: ['A1'], A1: ['BUT1'], Q3: ['A2'] }

    // The bug the original walk was written against: stopping at the parents
    // leaves the promo out, and the promo is where the shared lectures are.
    it('climbs every level, not only the first', async () => {
        const { parentsOf } = hierarchy(TREE)

        expect([...(await walkAncestors(['S1a'], parentsOf))].sort()).toEqual(['A1', 'BUT1', 'S1'])
    })

    it('leaves the starting groups out', async () => {
        const { parentsOf } = hierarchy(TREE)

        expect((await walkAncestors(['S1a'], parentsOf)).has('S1a')).toBe(false)
    })

    it('merges the ancestors of several groups', async () => {
        const { parentsOf } = hierarchy(TREE)

        expect([...(await walkAncestors(['S1a', 'S1b', 'Q3'], parentsOf))].sort()).toEqual([
            'A1',
            'A2',
            'BUT1',
            'S1',
        ])
    })

    it('returns nothing for a root, or for no group', async () => {
        const { parentsOf } = hierarchy(TREE)

        expect((await walkAncestors(['BUT1'], parentsOf)).size).toBe(0)
        expect((await walkAncestors([], parentsOf)).size).toBe(0)
    })

    // Nothing stops an admin from making two groups each other's parent.
    it('ends on a cycle', async () => {
        const { parentsOf, calls } = hierarchy({ a: ['b'], b: ['c'], c: ['a'] })

        expect([...(await walkAncestors(['a'], parentsOf))].sort()).toEqual(['a', 'b', 'c'])
        expect(calls.length).toBeLessThan(6)
    })

    it('asks for one level at a time, in a single batch', async () => {
        const { parentsOf, calls } = hierarchy(TREE)

        await walkAncestors(['S1a', 'S1b'], parentsOf)

        expect(calls).toEqual([['S1a', 'S1b'], ['S1'], ['A1'], ['BUT1']])
    })
})

describe('includeAncestorGroups', () => {
    it('is on when the parameter is absent', () => {
        expect(IncludeAncestorGroupsSchema.parse(undefined)).toBe(true)
    })

    it.each([
        ['true', true],
        ['1', true],
        ['false', false],
        ['0', false],
    ])('reads %j as %s', (raw, expected) => {
        expect(IncludeAncestorGroupsSchema.parse(raw)).toBe(expected)
    })

    // `z.coerce.boolean()` would have read "false" as true; anything else that
    // is not a known spelling is refused rather than guessed at.
    it.each(['no', 'yes', '', 'FALSE'])('rejects %j', (raw) => {
        expect(IncludeAncestorGroupsSchema.safeParse(raw).success).toBe(false)
    })
})
