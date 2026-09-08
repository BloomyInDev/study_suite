import { eq, type SQL } from 'drizzle-orm'
import { users, userStudents, userTeachers } from '@studysuite/db'
import { db } from '../db.js'
import { listIdentities, pickDisplay, type IdentitySummary } from './identities.js'

export type EnrichedUser = typeof users.$inferSelect & {
    role: 'student' | 'teacher' | null
    studentGroupId: string | null
    assignedGroupId: string | null
    teacherId: string | null
    identities: IdentitySummary[]
}

export function userToDto(user: EnrichedUser) {
    const { displayName, avatarUrl } = pickDisplay(user.identities)
    return {
        id: user.id,
        displayName,
        avatarUrl,
        identities: user.identities,
        role: user.role,
        isAdmin: user.isAdmin,
        status: user.status,
        studentGroupId: user.studentGroupId,
        assignedGroupId: user.assignedGroupId,
        teacherId: user.teacherId,
    }
}

type RawRow = {
    id: string
    discordId: string | null
    discordUsername: string | null
    discordAvatar: string | null
    isAdmin: boolean
    status: 'pending' | 'approved' | 'rejected'
    discordAccessToken: string | null
    discordTokenExpiresAt: Date | null
    createdAt: Date
    updatedAt: Date
    _studentUserId: string | null
    _teacherUserId: string | null
    studentGroupId: string | null
    assignedGroupId: string | null
    teacherId: string | null
}

function toEnriched(
    { _studentUserId, _teacherUserId, ...rest }: RawRow,
    identities: IdentitySummary[],
): EnrichedUser {
    return {
        ...rest,
        role: _studentUserId ? 'student' : _teacherUserId ? 'teacher' : null,
        studentGroupId: rest.studentGroupId ?? null,
        assignedGroupId: rest.assignedGroupId ?? null,
        teacherId: rest.teacherId ?? null,
        identities,
    }
}

const enrichedSelect = {
    id: users.id,
    discordId: users.discordId,
    discordUsername: users.discordUsername,
    discordAvatar: users.discordAvatar,
    isAdmin: users.isAdmin,
    status: users.status,
    discordAccessToken: users.discordAccessToken,
    discordTokenExpiresAt: users.discordTokenExpiresAt,
    createdAt: users.createdAt,
    updatedAt: users.updatedAt,
    _studentUserId: userStudents.userId,
    _teacherUserId: userTeachers.userId,
    studentGroupId: userStudents.studentGroupId,
    assignedGroupId: userStudents.assignedGroupId,
    teacherId: userTeachers.teacherId,
}

export async function fetchEnrichedUser(where: SQL): Promise<EnrichedUser | null> {
    const rows = await db
        .select(enrichedSelect)
        .from(users)
        .leftJoin(userStudents, eq(userStudents.userId, users.id))
        .leftJoin(userTeachers, eq(userTeachers.userId, users.id))
        .where(where)
        .limit(1)
    if (!rows[0]) return null
    const row = rows[0] as RawRow
    const identities = await listIdentities([row.id])
    return toEnriched(row, identities.get(row.id) ?? [])
}

export async function listEnrichedUsers(): Promise<EnrichedUser[]> {
    const rows = await db
        .select(enrichedSelect)
        .from(users)
        .leftJoin(userStudents, eq(userStudents.userId, users.id))
        .leftJoin(userTeachers, eq(userTeachers.userId, users.id))
        .orderBy(users.createdAt)
    const identities = await listIdentities(rows.map((r) => r.id))
    return rows.map((r) => toEnriched(r as RawRow, identities.get(r.id) ?? []))
}
