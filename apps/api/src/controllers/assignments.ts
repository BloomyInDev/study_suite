import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import {
    assignmentCompletions,
    assignments,
    eventStudentGroups,
    eventTeachers,
    userStudents,
    userTeachers,
} from '@studysuite/db'
import { and, asc, count, eq } from 'drizzle-orm'
import { db } from '../db.js'
import {
    isSuperuserRequest,
    mayChangeAssignment,
    SUPERUSER_HEADER,
} from '../lib/assignment-lock.js'
import { getAncestorGroupIds } from '../lib/group-ancestors.js'
import { pickDisplay, type IdentitySummary } from '../lib/identities.js'
import { requireAuth, type AuthEnv } from '../middleware/auth.js'
import {
    AssignmentDtoSchema,
    IdParamSchema,
    dataResponse,
    errorResponse,
    jsonResponse,
} from '../schemas/responses.js'

const createSchema = z
    .object({
        title: z.string().min(1).max(255).openapi({ example: 'Rendu TP3' }),
        subject: z.string().max(100).optional().openapi({ example: 'R5.05' }),
        description: z.string().optional().openapi({ example: 'Archive .tar.gz sur Moodle' }),
        dueDate: z.coerce.date().openapi({ example: '2026-09-15T23:59:00.000Z' }),
        studentGroupId: z
            .string()
            .uuid()
            .openapi({ example: '4d8b6a2c-7e1f-4a3b-9c5d-8e0f2a4b6c8d' }),
        eventId: z.string().uuid().optional().openapi({
            description: 'Course this was set in',
            example: '2a7c9e1b-5d3f-4a8b-9c2e-6f0a1b3c5d7e',
        }),
    })
    .openapi('CreateAssignment')

const patchSchema = z
    .object({
        title: z.string().min(1).max(255).optional().openapi({ example: 'Rendu TP3 (reporté)' }),
        subject: z.string().max(100).nullable().optional().openapi({ example: 'R5.05' }),
        description: z.string().nullable().optional().openapi({ example: 'Sujet mis à jour' }),
        dueDate: z.coerce.date().optional().openapi({ example: '2026-09-22T23:59:00.000Z' }),
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

export const withRelations = {
    studentGroup: true as const,
    event: true as const,
    // The display name lives in user_identities now, not on the user row.
    createdBy: { with: { identities: true as const, teacherProfile: true as const } },
    updatedBy: { with: { identities: true as const } },
    completions: true as const,
}

function authorRef(user: { id: string; identities: IdentitySummary[] } | null) {
    return user ? { id: user.id, displayName: pickDisplay(user.identities).displayName } : null
}

type AssignmentRow = Awaited<ReturnType<typeof fetchAssignment>>

async function fetchAssignment(id: string) {
    return db.query.assignments.findFirst({
        where: (a, { eq }) => eq(a.id, id),
        with: withRelations,
    })
}

export function assignmentToDto(row: NonNullable<AssignmentRow>, myUserId: string | null) {
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
            ? { ...authorRef(row.createdBy)!, isTeacher: !!row.createdBy.teacherProfile }
            : null,
        updatedBy: authorRef(row.updatedBy),
        completedByMe: row.completions.some((c) => c.userId === myUserId),
        completionCount: row.completions.length,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
    }
}

/**
 * The groups whose homework someone may read and write: every group, or a set.
 *
 * Every group for an admin, and for a teacher account not linked to a row in
 * `teachers`. The teacher role only comes from an admin's approval or a
 * `teacher` IUT mapping, so the account is vouched for even when nobody said
 * which teacher it is. A linked teacher gets the groups of their own courses,
 * a student their class and its ancestors.
 */
type GroupScope = { all: true } | { all: false; ids: Set<string> }

const inScope = (scope: GroupScope, groupId: string) => scope.all || scope.ids.has(groupId)

async function getGroupScope(userId: string, isAdmin: boolean): Promise<GroupScope> {
    if (isAdmin) return { all: true }
    const [teacher] = await db.select().from(userTeachers).where(eq(userTeachers.userId, userId))
    if (teacher && !teacher.teacherId) return { all: true }
    return { all: false, ids: await getUserAccessibleGroupIds(userId, teacher?.teacherId ?? null) }
}

async function getUserAccessibleGroupIds(
    userId: string,
    teacherId: string | null,
): Promise<Set<string>> {
    const result = new Set<string>()

    const [student] = await db.select().from(userStudents).where(eq(userStudents.userId, userId))
    if (student?.studentGroupId) {
        result.add(student.studentGroupId)
        const ancestors = await getAncestorGroupIds(student.studentGroupId)
        ancestors.forEach((id) => result.add(id))
    }

    if (teacherId) {
        const rows = await db
            .selectDistinct({ groupId: eventStudentGroups.studentGroupId })
            .from(eventTeachers)
            .innerJoin(eventStudentGroups, eq(eventStudentGroups.eventId, eventTeachers.eventId))
            .where(eq(eventTeachers.teacherId, teacherId))
        rows.forEach((r) => result.add(r.groupId))
    }

    return result
}

async function canWrite(userId: string, isAdmin: boolean, groupId: string): Promise<boolean> {
    return inScope(await getGroupScope(userId, isAdmin), groupId)
}

async function isTeacherAccount(userId: string): Promise<boolean> {
    const [row] = await db
        .select({ userId: userTeachers.userId })
        .from(userTeachers)
        .where(eq(userTeachers.userId, userId))
    return !!row
}

/** Whether this request may edit or delete `row`, beyond the group check. */
async function passesTeacherLock(
    row: NonNullable<AssignmentRow>,
    payload: { sub: string; isAdmin: boolean },
    superuserHeader: string | undefined,
): Promise<boolean> {
    const authorIsTeacher = !!row.createdBy?.teacherProfile
    if (!authorIsTeacher) return true
    return mayChangeAssignment(authorIsTeacher, {
        isTeacher: await isTeacherAccount(payload.sub),
        isAdmin: payload.isAdmin,
        superuser: isSuperuserRequest(superuserHeader),
    })
}

const TEACHER_LOCKED = {
    error: { code: 'TEACHER_LOCKED', message: "Only a teacher may change a teacher's homework" },
} as const

const app = new OpenAPIHono<AuthEnv>()
app.use(requireAuth)

app.openapi(
    createRoute({
        method: 'get',
        path: '/',
        operationId: 'listAssignments',
        summary: 'List assignments for your group',
        tags: ['Assignments'],
        security: [{ Bearer: [] }],
        request: { query: listSchema },
        responses: {
            200: dataResponse(
                z.array(AssignmentDtoSchema),
                'Assignments accessible to the current user',
            ),
            401: errorResponse('Unauthorized'),
        },
    }),
    async (c) => {
        const payload = c.get('user')
        const { groupIds, from, to } = c.req.valid('query')

        const scope = await getGroupScope(payload.sub, payload.isAdmin)
        const allowedGroupIds = scope.all
            ? (groupIds ?? [])
            : groupIds
              ? groupIds.filter((id) => scope.ids.has(id))
              : [...scope.ids]

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
        path: '/groups',
        operationId: 'listWritableAssignmentGroups',
        summary: 'The groups I may add homework to',
        description:
            "`all: true` for an admin and for a teacher account not linked to a teacher, who may write for every group; `groupIds` is then empty. Otherwise the groups of a linked teacher's courses, or a student's class and its ancestors. Registered before `/{id}`, which would otherwise read `groups` as an id.",
        tags: ['Assignments'],
        security: [{ Bearer: [] }],
        responses: {
            200: dataResponse(
                z.object({ all: z.boolean(), groupIds: z.array(z.string().uuid()) }),
                'Writable groups',
            ),
            401: errorResponse('Unauthorized'),
        },
    }),
    async (c) => {
        const payload = c.get('user')
        const scope = await getGroupScope(payload.sub, payload.isAdmin)
        return c.json({ data: { all: scope.all, groupIds: scope.all ? [] : [...scope.ids] } }, 200)
    },
)

app.openapi(
    createRoute({
        method: 'get',
        path: '/{id}',
        operationId: 'getAssignment',
        summary: 'Get one assignment',
        tags: ['Assignments'],
        security: [{ Bearer: [] }],
        request: { params: IdParamSchema },
        responses: {
            200: dataResponse(AssignmentDtoSchema, 'Assignment detail'),
            401: errorResponse('Unauthorized'),
            403: errorResponse('Forbidden'),
            404: errorResponse('Not found'),
        },
    }),
    async (c) => {
        const payload = c.get('user')
        const { id } = c.req.valid('param')
        const row = await fetchAssignment(id)
        if (!row)
            return c.json({ error: { code: 'NOT_FOUND', message: 'Assignment not found' } }, 404)

        if (!inScope(await getGroupScope(payload.sub, payload.isAdmin), row.studentGroupId)) {
            return c.json({ error: { code: 'FORBIDDEN', message: 'Access denied' } }, 403)
        }

        return c.json({ data: assignmentToDto(row, payload.sub) }, 200)
    },
)

app.openapi(
    createRoute({
        method: 'post',
        path: '/',
        operationId: 'createAssignment',
        summary: 'Create an assignment',
        tags: ['Assignments'],
        security: [{ Bearer: [] }],
        request: {
            body: { content: { 'application/json': { schema: createSchema } }, required: true },
        },
        responses: {
            201: dataResponse(AssignmentDtoSchema, 'Created'),
            401: errorResponse('Unauthorized'),
            403: errorResponse('Forbidden'),
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
        summary: 'Edit an assignment',
        tags: ['Assignments'],
        security: [{ Bearer: [] }],
        request: {
            params: IdParamSchema,
            body: { content: { 'application/json': { schema: patchSchema } }, required: true },
        },
        responses: {
            200: dataResponse(AssignmentDtoSchema, 'Updated'),
            401: errorResponse('Unauthorized'),
            403: errorResponse('Forbidden'),
            404: errorResponse('Not found'),
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
        if (!(await passesTeacherLock(existing, payload, c.req.header(SUPERUSER_HEADER)))) {
            return c.json(TEACHER_LOCKED, 403)
        }
        if (
            body.studentGroupId &&
            body.studentGroupId !== existing.studentGroupId &&
            !(await canWrite(payload.sub, payload.isAdmin, targetGroupId))
        ) {
            return c.json(
                { error: { code: 'FORBIDDEN', message: 'Access denied on target group' } },
                403,
            )
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
        summary: 'Delete an assignment',
        tags: ['Assignments'],
        security: [{ Bearer: [] }],
        request: { params: IdParamSchema },
        responses: {
            200: dataResponse(z.object({ id: z.string().uuid() }), 'Deleted'),
            401: errorResponse('Unauthorized'),
            403: errorResponse('Forbidden'),
            404: errorResponse('Not found'),
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
        if (!(await passesTeacherLock(existing, payload, c.req.header(SUPERUSER_HEADER)))) {
            return c.json(TEACHER_LOCKED, 403)
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
        summary: 'Mark an assignment done',
        tags: ['Assignments'],
        security: [{ Bearer: [] }],
        request: { params: IdParamSchema },
        responses: {
            200: jsonResponse(CompletionStatusSchema, 'Marked as complete'),
            401: errorResponse('Unauthorized'),
            403: errorResponse('Forbidden'),
            404: errorResponse('Not found'),
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
        summary: 'Mark an assignment not done',
        tags: ['Assignments'],
        security: [{ Bearer: [] }],
        request: { params: IdParamSchema },
        responses: {
            200: jsonResponse(CompletionStatusSchema, 'Marked as incomplete'),
            401: errorResponse('Unauthorized'),
            403: errorResponse('Forbidden'),
            404: errorResponse('Not found'),
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
