import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../../db.js'
import { users, userStudents, userTeachers } from '@studysuite/db'
import { requireAuth, requireAdmin, type AuthEnv } from '../../middleware/auth.js'
import { type EnrichedUser } from '../auth.js'

const patchSchema = z.object({
    status: z.enum(['approved', 'rejected', 'pending']).optional(),
    isAdmin: z.boolean().optional(),
    role: z.enum(['student', 'teacher']).nullable().optional(),
    studentGroupId: z.string().uuid().nullable().optional(),
    teacherId: z.string().uuid().nullable().optional(),
})

async function listEnrichedUsers(): Promise<EnrichedUser[]> {
    const rows = await db
        .select({
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
        })
        .from(users)
        .leftJoin(userStudents, eq(userStudents.userId, users.id))
        .leftJoin(userTeachers, eq(userTeachers.userId, users.id))
        .orderBy(users.createdAt)

    return rows.map(({ _studentUserId, _teacherUserId, ...rest }) => ({
        ...rest,
        role: _studentUserId ? 'student' : _teacherUserId ? 'teacher' : null,
        studentGroupId: rest.studentGroupId ?? null,
        teacherId: rest.teacherId ?? null,
    }))
}

export default new Hono<AuthEnv>()
    .use(requireAuth, requireAdmin)

    .get('/', async (c) => {
        const all = await listEnrichedUsers()
        return c.json({ data: all })
    })

    .patch('/:id', zValidator('json', patchSchema), async (c) => {
        const id = c.req.param('id')
        const body = c.req.valid('json')

        const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1)
        if (!existing) {
            return c.json({ error: { code: 'NOT_FOUND', message: 'User not found' } }, 404)
        }

        const userUpdate: Partial<typeof users.$inferInsert> = { updatedAt: new Date() }
        if (body.status !== undefined) userUpdate.status = body.status
        if (body.isAdmin !== undefined) userUpdate.isAdmin = body.isAdmin

        await db.update(users).set(userUpdate).where(eq(users.id, id))

        if (body.role === null) {
            await db.delete(userStudents).where(eq(userStudents.userId, id))
            await db.delete(userTeachers).where(eq(userTeachers.userId, id))
        } else if (body.role === 'student') {
            await db.delete(userTeachers).where(eq(userTeachers.userId, id))
            await db
                .insert(userStudents)
                .values({ userId: id, studentGroupId: body.studentGroupId ?? null })
                .onConflictDoUpdate({
                    target: userStudents.userId,
                    set: { studentGroupId: body.studentGroupId ?? null },
                })
        } else if (body.role === 'teacher') {
            await db.delete(userStudents).where(eq(userStudents.userId, id))
            await db
                .insert(userTeachers)
                .values({ userId: id, teacherId: body.teacherId ?? null })
                .onConflictDoUpdate({
                    target: userTeachers.userId,
                    set: { teacherId: body.teacherId ?? null },
                })
        } else if (body.studentGroupId !== undefined) {
            await db
                .update(userStudents)
                .set({ studentGroupId: body.studentGroupId })
                .where(eq(userStudents.userId, id))
        } else if (body.teacherId !== undefined) {
            await db
                .update(userTeachers)
                .set({ teacherId: body.teacherId })
                .where(eq(userTeachers.userId, id))
        }

        const [updated] = await db
            .select({
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
            })
            .from(users)
            .leftJoin(userStudents, eq(userStudents.userId, users.id))
            .leftJoin(userTeachers, eq(userTeachers.userId, users.id))
            .where(eq(users.id, id))
            .limit(1)

        const { _studentUserId, _teacherUserId, ...rest } = updated
        const enriched: EnrichedUser = {
            ...rest,
            role: _studentUserId ? 'student' : _teacherUserId ? 'teacher' : null,
            studentGroupId: rest.studentGroupId ?? null,
            teacherId: rest.teacherId ?? null,
        }

        return c.json({ data: enriched })
    })
