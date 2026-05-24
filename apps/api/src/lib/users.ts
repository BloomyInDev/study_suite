import { eq, type SQL } from 'drizzle-orm'
import { users, userStudents, userTeachers } from '@studysuite/db'
import { db } from '../db.js'

export type EnrichedUser = typeof users.$inferSelect & {
    role: 'student' | 'teacher' | null
    studentGroupId: string | null
    teacherId: string | null
}

export function userToDto(user: EnrichedUser) {
    return {
        id: user.id,
        discordId: user.discordId,
        discordUsername: user.discordUsername,
        discordAvatar: user.discordAvatar,
        role: user.role,
        isAdmin: user.isAdmin,
        status: user.status,
        studentGroupId: user.studentGroupId,
        teacherId: user.teacherId,
    }
}

type RawRow = {
    id: string
    discordId: string
    discordUsername: string
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
    teacherId: string | null
}

function toEnriched({ _studentUserId, _teacherUserId, ...rest }: RawRow): EnrichedUser {
    return {
        ...rest,
        role: _studentUserId ? 'student' : _teacherUserId ? 'teacher' : null,
        studentGroupId: rest.studentGroupId ?? null,
        teacherId: rest.teacherId ?? null,
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
    return rows[0] ? toEnriched(rows[0] as RawRow) : null
}

export async function listEnrichedUsers(): Promise<EnrichedUser[]> {
    const rows = await db
        .select(enrichedSelect)
        .from(users)
        .leftJoin(userStudents, eq(userStudents.userId, users.id))
        .leftJoin(userTeachers, eq(userTeachers.userId, users.id))
        .orderBy(users.createdAt)
    return rows.map((r) => toEnriched(r as RawRow))
}
