import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { eq } from 'drizzle-orm'
import { db } from '../../db.js'
import { users, userStudents, userTeachers } from '@studysuite/db'
import { requireAuth, requireAdmin, type AuthEnv } from '../../middleware/auth.js'
import { fetchEnrichedUser, listEnrichedUsers, userToDto } from '../../lib/users.js'
import {
    IdParamSchema,
    UserDtoSchema,
    dataResponse,
    errorResponse,
} from '../../schemas/responses.js'

const patchSchema = z
    .object({
        status: z.enum(['approved', 'rejected', 'pending']).optional().openapi({ example: 'approved' }),
        isAdmin: z.boolean().optional().openapi({ example: false }),
        role: z.enum(['student', 'teacher']).nullable().optional().openapi({ example: 'student' }),
        studentGroupId: z
            .string()
            .uuid()
            .nullable()
            .optional()
            .openapi({ example: '4d8b6a2c-7e1f-4a3b-9c5d-8e0f2a4b6c8d' }),
        teacherId: z.string().uuid().nullable().optional(),
    })
    .openapi('AdminUpdateUser')

const app = new OpenAPIHono<AuthEnv>()
app.use(requireAuth, requireAdmin)

app.openapi(
    createRoute({
        method: 'get',
        path: '/',
        operationId: 'adminListUsers',
        summary: 'List every user',
        tags: ['Admin'],
        security: [{ Bearer: [] }],
        responses: {
            200: dataResponse(z.array(UserDtoSchema), 'All users'),
            401: errorResponse('Unauthorized'),
        },
    }),
    async (c) => {
        const all = await listEnrichedUsers()
        return c.json({ data: all.map(userToDto) }, 200)
    },
)

app.openapi(
    createRoute({
        method: 'patch',
        path: '/{id}',
        operationId: 'adminUpdateUser',
        summary: "Change a user's status, role, group or admin flag",
        tags: ['Admin'],
        security: [{ Bearer: [] }],
        request: {
            params: IdParamSchema,
            body: { content: { 'application/json': { schema: patchSchema } }, required: true },
        },
        responses: {
            200: dataResponse(UserDtoSchema, 'Updated user'),
            401: errorResponse('Unauthorized'),
            403: errorResponse('Forbidden'),
            404: errorResponse('Not found'),
        },
    }),
    async (c) => {
        const { id } = c.req.valid('param')
        const body = c.req.valid('json')
        const payload = c.get('user')

        if (body.isAdmin === false && id === payload.sub) {
            return c.json(
                { error: { code: 'SELF_DEMOTE', message: 'Cannot remove your own admin status' } },
                403,
            )
        }

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
                .values({
                    userId: id,
                    studentGroupId: body.studentGroupId ?? null,
                    assignedGroupId: body.studentGroupId ?? null,
                })
                // Re-sending the role without a group must not clear the one set.
                .onConflictDoUpdate({
                    target: userStudents.userId,
                    set:
                        body.studentGroupId !== undefined
                            ? {
                                  studentGroupId: body.studentGroupId,
                                  assignedGroupId: body.studentGroupId,
                              }
                            : {},
                })
        } else if (body.role === 'teacher') {
            await db.delete(userStudents).where(eq(userStudents.userId, id))
            await db
                .insert(userTeachers)
                .values({ userId: id, teacherId: body.teacherId ?? null })
                .onConflictDoUpdate({
                    target: userTeachers.userId,
                    set: body.teacherId !== undefined ? { teacherId: body.teacherId } : {},
                })
        } else if (body.studentGroupId !== undefined) {
            await db
                .update(userStudents)
                .set({ studentGroupId: body.studentGroupId, assignedGroupId: body.studentGroupId })
                .where(eq(userStudents.userId, id))
        } else if (body.teacherId !== undefined) {
            await db
                .update(userTeachers)
                .set({ teacherId: body.teacherId })
                .where(eq(userTeachers.userId, id))
        }

        const enriched = await fetchEnrichedUser(eq(users.id, id))
        return c.json({ data: userToDto(enriched!) }, 200)
    },
)

export default app
