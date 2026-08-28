import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import {
    assignmentCompletions,
    assignments,
    eventStudentGroups,
    eventTeachers,
    studentGroupMemberships,
    userStudents,
    userTeachers,
} from '@studysuite/db'
import { and, asc, count, eq, inArray } from 'drizzle-orm'
import { db } from '../db.js'
import { requireAuth, type AuthEnv } from '../middleware/auth.js'
import { AssignmentDtoSchema, ErrorSchema, IdParamSchema } from '../schemas/responses.js'

const createSchema = z
    .object({
        title: z.string().min(1).max(255),
        subject: z.string().max(100).optional(),
        description: z.string().optional(),
        dueDate: z.coerce.date(),
        studentGroupId: z.string().uuid(),
        eventId: z.string().uuid().optional(),
    })
    .openapi('CreateAssignment')

const patchSchema = z
    .object({
        title: z.string().min(1).max(255).optional(),
        subject: z.string().max(100).nullable().optional(),
        description: z.string().nullable().optional(),
        dueDate: z.coerce.date().optional(),
        studentGroupId: z.string().uuid().optional(),
        eventId: z.string().uuid().nullable().optional(),
    })
    .openapi('UpdateAssignment')

const listSchema = z.object({
    groupIds: z
        .string()
        .optional()
        .transform((s) => (s ? s.split(',').filter(Boolean) : undefined)),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
})

const CompletionStatusSchema = z.object({
    data: z.object({ completedByMe: z.boolean(), completionCount: z.number() }),
})

const withRelations = {
    studentGroup: true as const,
    event: true as const,
    createdBy: true as const,
    updatedBy: true as const,
    completions: true as const,
}

type AssignmentRow = Awaited<ReturnType<typeof fetchAssignment>>

async function fetchAssignment(id: string) {
    return db.query.assignments.findFirst({
        where: (a, { eq }) => eq(a.id, id),
        with: withRelations,
    })
}

function assignmentToDto(row: NonNullable<AssignmentRow>, myUserId: string) {
    return {
        id: row.id,
        title: row.title,
        subject: row.subject,
        description: row.description,
        dueDate: row.dueDate.toISOString(),
        studentGroup: {
            id: row.studentGroup.id,
            internalName: row.studentGroup.internalName,
            displayName: row.studentGroup.displayName,
        },
        event: row.event ? { id: row.event.id, title: row.event.title } : null,
        createdBy: row.createdBy
            ? { id: row.createdBy.id, discordUsername: row.createdBy.discordUsername }
            : null,
        updatedBy: row.updatedBy
            ? { id: row.updatedBy.id, discordUsername: row.updatedBy.discordUsername }
            : null,
        completedByMe: row.completions.some((c) => c.userId === myUserId),
        completionCount: row.completions.length,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
    }
}

async function getAncestorGroupIds(groupId: string): Promise<Set<string>> {
    const result = new Set<string>()
    let current = [groupId]
    while (current.length > 0) {
        const rows = await db
            .select({ parentId: studentGroupMemberships.parentId })
            .from(studentGroupMemberships)
            .where(inArray(studentGroupMemberships.childId, current))
        const parents = rows.map((r) => r.parentId)
        parents.forEach((p) => result.add(p))
        current = parents.filter((p) => !result.has(p))
    }
    return result
}

async function getUserAccessibleGroupIds(userId: string): Promise<Set<string>> {
    const result = new Set<string>()

    const [student] = await db.select().from(userStudents).where(eq(userStudents.userId, userId))
    if (student?.studentGroupId) {
        result.add(student.studentGroupId)
        const ancestors = await getAncestorGroupIds(student.studentGroupId)
        ancestors.forEach((id) => result.add(id))
    }

    const [teacher] = await db.select().from(userTeachers).where(eq(userTeachers.userId, userId))
    if (teacher?.teacherId) {
        const rows = await db
            .selectDistinct({ groupId: eventStudentGroups.studentGroupId })
            .from(eventTeachers)
            .innerJoin(eventStudentGroups, eq(eventStudentGroups.eventId, eventTeachers.eventId))
            .where(eq(eventTeachers.teacherId, teacher.teacherId))
        rows.forEach((r) => result.add(r.groupId))
    }

    return result
}

async function canWrite(userId: string, isAdmin: boolean, groupId: string): Promise<boolean> {
    if (isAdmin) return true
    const accessible = await getUserAccessibleGroupIds(userId)
    return accessible.has(groupId)
}

const app = new OpenAPIHono<AuthEnv>()
app.use(requireAuth)

app.openapi(
    createRoute({
        method: 'get',
        path: '/',
        operationId: 'listAssignments',
        tags: ['Assignments'],
        security: [{ Bearer: [] }],
        request: { query: listSchema },
        responses: {
            200: {
                content: { 'application/json': { schema: z.object({ data: z.array(AssignmentDtoSchema) }) } },
                description: 'Assignments accessible to the current user',
            },
            401: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Unauthorized' },
        },
    }),
    async (c) => {
        const payload = c.get('user')
        const { groupIds, from, to } = c.req.valid('query')

        let allowedGroupIds: string[]
        if (payload.isAdmin) {
            allowedGroupIds = groupIds ?? []
        } else {
            const accessible = await getUserAccessibleGroupIds(payload.sub)
            allowedGroupIds = groupIds
                ? groupIds.filter((id) => accessible.has(id))
                : [...accessible]
        }

        if (allowedGroupIds.length === 0) return c.json({ data: [] }, 200)

        const rows = await db.query.assignments.findMany({
            where: (a, { and: _and, inArray: _inArray, gte, lte }) =>
                _and(
                    _inArray(a.studentGroupId, allowedGroupIds),
                    from ? gte(a.dueDate, from) : undefined,
                    to ? lte(a.dueDate, to) : undefined,
                ),
            with: withRelations,
            orderBy: asc(assignments.dueDate),
        })

        return c.json({ data: rows.map((r) => assignmentToDto(r, payload.sub)) }, 200)
    },
)

app.openapi(
    createRoute({
        method: 'get',
        path: '/{id}',
        operationId: 'getAssignment',
        tags: ['Assignments'],
        security: [{ Bearer: [] }],
        request: { params: IdParamSchema },
        responses: {
            200: { content: { 'application/json': { schema: z.object({ data: AssignmentDtoSchema }) } }, description: 'Assignment detail' },
            401: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Unauthorized' },
            403: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Forbidden' },
            404: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Not found' },
        },
    }),
    async (c) => {
        const payload = c.get('user')
        const { id } = c.req.valid('param')
        const row = await fetchAssignment(id)
        if (!row)
            return c.json({ error: { code: 'NOT_FOUND', message: 'Assignment not found' } }, 404)

        if (!payload.isAdmin) {
            const accessible = await getUserAccessibleGroupIds(payload.sub)
            if (!accessible.has(row.studentGroupId)) {
                return c.json({ error: { code: 'FORBIDDEN', message: 'Access denied' } }, 403)
            }
        }

        return c.json({ data: assignmentToDto(row, payload.sub) }, 200)
    },
)

app.openapi(
    createRoute({
        method: 'post',
        path: '/',
        operationId: 'createAssignment',
        tags: ['Assignments'],
        security: [{ Bearer: [] }],
        request: {
            body: { content: { 'application/json': { schema: createSchema } }, required: true },
        },
        responses: {
            201: { content: { 'application/json': { schema: z.object({ data: AssignmentDtoSchema }) } }, description: 'Created' },
            401: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Unauthorized' },
            403: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Forbidden' },
        },
    }),
    async (c) => {
        const payload = c.get('user')
        if (payload.status !== 'approved') {
            return c.json({ error: { code: 'FORBIDDEN', message: 'Account not approved' } }, 403)
        }
        const body = c.req.valid('json')

        if (!(await canWrite(payload.sub, payload.isAdmin, body.studentGroupId))) {
            return c.json({ error: { code: 'FORBIDDEN', message: 'Access denied' } }, 403)
        }

        const [created] = await db
            .insert(assignments)
            .values({
                title: body.title,
                subject: body.subject,
                description: body.description,
                dueDate: body.dueDate,
                studentGroupId: body.studentGroupId,
                eventId: body.eventId,
                createdById: payload.sub,
            })
            .returning({ id: assignments.id })

        const row = await fetchAssignment(created.id)
        return c.json({ data: assignmentToDto(row!, payload.sub) }, 201)
    },
)

app.openapi(
    createRoute({
        method: 'patch',
        path: '/{id}',
        operationId: 'updateAssignment',
        tags: ['Assignments'],
        security: [{ Bearer: [] }],
        request: {
            params: IdParamSchema,
            body: { content: { 'application/json': { schema: patchSchema } }, required: true },
        },
        responses: {
            200: { content: { 'application/json': { schema: z.object({ data: AssignmentDtoSchema }) } }, description: 'Updated' },
            401: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Unauthorized' },
            403: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Forbidden' },
            404: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Not found' },
        },
    }),
    async (c) => {
        const payload = c.get('user')
        if (payload.status !== 'approved') {
            return c.json({ error: { code: 'FORBIDDEN', message: 'Account not approved' } }, 403)
        }
        const { id } = c.req.valid('param')
        const body = c.req.valid('json')

        const existing = await fetchAssignment(id)
        if (!existing) {
            return c.json({ error: { code: 'NOT_FOUND', message: 'Assignment not found' } }, 404)
        }

        const targetGroupId = body.studentGroupId ?? existing.studentGroupId
        if (!(await canWrite(payload.sub, payload.isAdmin, existing.studentGroupId))) {
            return c.json({ error: { code: 'FORBIDDEN', message: 'Access denied' } }, 403)
        }
        if (
            body.studentGroupId &&
            body.studentGroupId !== existing.studentGroupId &&
            !(await canWrite(payload.sub, payload.isAdmin, targetGroupId))
        ) {
            return c.json({ error: { code: 'FORBIDDEN', message: 'Access denied on target group' } }, 403)
        }

        await db
            .update(assignments)
            .set({ ...body, updatedById: payload.sub, updatedAt: new Date() })
            .where(eq(assignments.id, id))

        const row = await fetchAssignment(id)
        return c.json({ data: assignmentToDto(row!, payload.sub) }, 200)
    },
)

app.openapi(
    createRoute({
        method: 'delete',
        path: '/{id}',
        operationId: 'deleteAssignment',
        tags: ['Assignments'],
        security: [{ Bearer: [] }],
        request: { params: IdParamSchema },
        responses: {
            200: {
                content: { 'application/json': { schema: z.object({ data: z.object({ id: z.string().uuid() }) }) } },
                description: 'Deleted',
            },
            401: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Unauthorized' },
            403: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Forbidden' },
            404: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Not found' },
        },
    }),
    async (c) => {
        const payload = c.get('user')
        if (payload.status !== 'approved') {
            return c.json({ error: { code: 'FORBIDDEN', message: 'Account not approved' } }, 403)
        }
        const { id } = c.req.valid('param')

        const existing = await fetchAssignment(id)
        if (!existing) {
            return c.json({ error: { code: 'NOT_FOUND', message: 'Assignment not found' } }, 404)
        }
        if (!(await canWrite(payload.sub, payload.isAdmin, existing.studentGroupId))) {
            return c.json({ error: { code: 'FORBIDDEN', message: 'Access denied' } }, 403)
        }

        await db.delete(assignments).where(eq(assignments.id, id))
        return c.json({ data: { id } }, 200)
    },
)

app.openapi(
    createRoute({
        method: 'post',
        path: '/{id}/complete',
        operationId: 'completeAssignment',
        tags: ['Assignments'],
        security: [{ Bearer: [] }],
        request: { params: IdParamSchema },
        responses: {
            200: { content: { 'application/json': { schema: CompletionStatusSchema } }, description: 'Marked as complete' },
            401: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Unauthorized' },
            403: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Forbidden' },
            404: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Not found' },
        },
    }),
    async (c) => {
        const payload = c.get('user')
        if (payload.status !== 'approved') {
            return c.json({ error: { code: 'FORBIDDEN', message: 'Account not approved' } }, 403)
        }
        const { id } = c.req.valid('param')

        const existing = await fetchAssignment(id)
        if (!existing) {
            return c.json({ error: { code: 'NOT_FOUND', message: 'Assignment not found' } }, 404)
        }

        await db
            .insert(assignmentCompletions)
            .values({ assignmentId: id, userId: payload.sub })
            .onConflictDoNothing()

        const [{ total }] = await db
            .select({ total: count() })
            .from(assignmentCompletions)
            .where(eq(assignmentCompletions.assignmentId, id))

        return c.json({ data: { completedByMe: true, completionCount: total } }, 200)
    },
)

app.openapi(
    createRoute({
        method: 'delete',
        path: '/{id}/complete',
        operationId: 'uncompleteAssignment',
        tags: ['Assignments'],
        security: [{ Bearer: [] }],
        request: { params: IdParamSchema },
        responses: {
            200: { content: { 'application/json': { schema: CompletionStatusSchema } }, description: 'Marked as incomplete' },
            401: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Unauthorized' },
            403: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Forbidden' },
            404: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Not found' },
        },
    }),
    async (c) => {
        const payload = c.get('user')
        if (payload.status !== 'approved') {
            return c.json({ error: { code: 'FORBIDDEN', message: 'Account not approved' } }, 403)
        }
        const { id } = c.req.valid('param')

        const existing = await fetchAssignment(id)
        if (!existing) {
            return c.json({ error: { code: 'NOT_FOUND', message: 'Assignment not found' } }, 404)
        }

        await db
            .delete(assignmentCompletions)
            .where(
                and(
                    eq(assignmentCompletions.assignmentId, id),
                    eq(assignmentCompletions.userId, payload.sub),
                ),
            )

        const [{ total }] = await db
            .select({ total: count() })
            .from(assignmentCompletions)
            .where(eq(assignmentCompletions.assignmentId, id))

        return c.json({ data: { completedByMe: false, completionCount: total } }, 200)
    },
)

export default app
