import { studentGroupMemberships } from '@studysuite/db'
import { inArray } from 'drizzle-orm'
import { db } from '../db.js'
import { walkAncestors } from './ancestor-walk.js'

async function parentsOf(childIds: string[]): Promise<string[]> {
    const rows = await db
        .select({ parentId: studentGroupMemberships.parentId })
        .from(studentGroupMemberships)
        .where(inArray(studentGroupMemberships.childId, childIds))
    return rows.map((r) => r.parentId)
}

export async function getAncestorGroupIds(groupId: string): Promise<Set<string>> {
    return walkAncestors([groupId], parentsOf)
}

/**
 * The groups a filter on `ids` really means.
 *
 * A course is tagged with the widest group it is for: a promo-wide lecture
 * carries the promo, not each TD group under it. Filtering on a TD group alone
 * therefore misses it, and what a student calls "my timetable" is their group
 * plus every ancestor. That is the default; `includeAncestors: false` keeps
 * the filter to the exact groups asked for.
 */
export async function expandGroupIds(
    ids: readonly string[],
    includeAncestors: boolean,
): Promise<string[]> {
    if (!includeAncestors || ids.length === 0) return [...ids]
    return [...new Set([...ids, ...(await walkAncestors(ids, parentsOf))])]
}
