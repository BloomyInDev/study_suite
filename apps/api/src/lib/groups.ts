import { studentGroups } from '@studysuite/db'
import { asc, eq } from 'drizzle-orm'
import { db } from '../db.js'

export const withHierarchy = {
    parentMemberships: { with: { child: true as const } },
    childMemberships: { with: { parent: true as const } },
}

type GroupRef = { id: string; internalName: string; displayName: string | null }
type GroupWithHierarchy = {
    id: string
    internalName: string
    displayName: string | null
    hidden: boolean
    parentMemberships: { child: GroupRef }[]
    childMemberships: { parent: GroupRef }[]
}

const toRef = (g: GroupRef) => ({
    id: g.id,
    internalName: g.internalName,
    displayName: g.displayName,
})

export const groupToDto = (row: GroupWithHierarchy) => ({
    id: row.id,
    internalName: row.internalName,
    displayName: row.displayName,
    hidden: row.hidden,
    children: row.parentMemberships.map((m) => toRef(m.child)),
    parents: row.childMemberships.map((m) => toRef(m.parent)),
})

export type GroupDto = ReturnType<typeof groupToDto>

/** Every group with its hierarchy, as `GET /api/groups` lists them. */
export async function listGroups(includeHidden: boolean): Promise<GroupDto[]> {
    const rows = await db.query.studentGroups.findMany({
        where: includeHidden ? undefined : eq(studentGroups.hidden, false),
        with: withHierarchy,
        orderBy: asc(studentGroups.internalName),
    })
    return rows.map(groupToDto)
}
