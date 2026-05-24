import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { eventStudentGroups, events, studentGroupMemberships, studentGroups } from '@studysuite/db'
import { and, asc, eq, gt, inArray, lt } from 'drizzle-orm'
import { db } from '../db.js'
import { eventToDto, withEventRelations } from '../lib/serialize.js'
import { OptionalDateRangeSchema } from '../schemas/query.js'
import { ErrorSchema, EventDtoSchema, GroupSchema, IdParamSchema } from '../schemas/responses.js'

const ParentBodySchema = z.object({ parentId: z.string().uuid() })

const IdParentIdParamSchema = z.object({
    id: z.string().uuid().openapi({ param: { name: 'id', in: 'path' } }),
    parentId: z.string().uuid().openapi({ param: { name: 'parentId', in: 'path' } }),
})

const withHierarchy = {
    parentMemberships: { with: { child: true as const } },
    childMemberships: { with: { parent: true as const } },
}

type GroupRef = { id: string; internalName: string }
type GroupWithHierarchy = {
    id: string
    internalName: string
    parentMemberships: { child: GroupRef }[]
    childMemberships: { parent: GroupRef }[]
}

const groupToDto = (row: GroupWithHierarchy) => ({
    id: row.id,
    internalName: row.internalName,
    children: row.parentMemberships.map((m) => ({ id: m.child.id, internalName: m.child.internalName })),
    parents: row.childMemberships.map((m) => ({ id: m.parent.id, internalName: m.parent.internalName })),
})

export default new OpenAPIHono()
    .openapi(
        createRoute({
            method: 'get',
            path: '/',
            operationId: 'listGroups',
            tags: ['Groups'],
            responses: {
                200: {
                    content: { 'application/json': { schema: z.object({ data: z.array(GroupSchema) }) } },
                    description: 'All groups with hierarchy',
                },
            },
        }),
        async (c) => {
            const rows = await db.query.studentGroups.findMany({
                with: withHierarchy,
                orderBy: asc(studentGroups.internalName),
            })
            return c.json({ data: rows.map(groupToDto) }, 200)
        },
    )
    .openapi(
        createRoute({
            method: 'get',
            path: '/{id}',
            operationId: 'getGroup',
            tags: ['Groups'],
            request: { params: IdParamSchema },
            responses: {
                200: { content: { 'application/json': { schema: z.object({ data: GroupSchema }) } }, description: 'Group with hierarchy' },
                404: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Not found' },
            },
        }),
        async (c) => {
            const { id } = c.req.valid('param')
            const row = await db.query.studentGroups.findFirst({
                where: eq(studentGroups.id, id),
                with: withHierarchy,
            })
            if (!row)
                return c.json({ error: { code: 'NOT_FOUND', message: 'Group not found' } }, 404)
            return c.json({ data: groupToDto(row) }, 200)
        },
    )
    .openapi(
        createRoute({
            method: 'get',
            path: '/{id}/events',
            operationId: 'listGroupEvents',
            tags: ['Groups'],
            request: { params: IdParamSchema, query: OptionalDateRangeSchema },
            responses: {
                200: {
                    content: { 'application/json': { schema: z.object({ data: z.array(EventDtoSchema) }) } },
                    description: 'Events for the group',
                },
                404: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Not found' },
            },
        }),
        async (c) => {
            const { id } = c.req.valid('param')
            const { from, to, dateFormat } = c.req.valid('query')
            const fromDate = from ? new Date(from) : undefined
            const toDate = to ? new Date(to) : undefined
            const [group] = await db.select().from(studentGroups).where(eq(studentGroups.id, id))
            if (!group)
                return c.json({ error: { code: 'NOT_FOUND', message: 'Group not found' } }, 404)
            const rows = await db.query.events.findMany({
                where: and(
                    inArray(
                        events.id,
                        db
                            .select({ id: eventStudentGroups.eventId })
                            .from(eventStudentGroups)
                            .where(eq(eventStudentGroups.studentGroupId, id)),
                    ),
                    fromDate ? gt(events.startDate, fromDate) : undefined,
                    toDate ? lt(events.startDate, toDate) : undefined,
                ),
                with: withEventRelations,
                orderBy: asc(events.startDate),
            })
            return c.json({ data: rows.map((r) => eventToDto(r, dateFormat)) }, 200)
        },
    )
    .openapi(
        createRoute({
            method: 'post',
            path: '/{id}/parents',
            operationId: 'addGroupParent',
            tags: ['Groups'],
            request: {
                params: IdParamSchema,
                body: { content: { 'application/json': { schema: ParentBodySchema } }, required: true },
            },
            responses: {
                201: {
                    content: {
                        'application/json': {
                            schema: z.object({ data: z.object({ parentId: z.string().uuid(), childId: z.string().uuid() }) }),
                        },
                    },
                    description: 'Parent relation created',
                },
                400: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Bad request' },
                404: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Not found' },
            },
        }),
        async (c) => {
            const childId = c.req.valid('param').id
            const { parentId } = c.req.valid('json')
            if (parentId === childId)
                return c.json(
                    { error: { code: 'BAD_REQUEST', message: 'A group cannot be its own parent' } },
                    400,
                )
            const [child] = await db.select().from(studentGroups).where(eq(studentGroups.id, childId))
            if (!child)
                return c.json({ error: { code: 'NOT_FOUND', message: 'Group not found' } }, 404)
            const [parent] = await db.select().from(studentGroups).where(eq(studentGroups.id, parentId))
            if (!parent)
                return c.json({ error: { code: 'NOT_FOUND', message: 'Parent group not found' } }, 404)
            await db.insert(studentGroupMemberships).values({ parentId, childId }).onConflictDoNothing()
            return c.json({ data: { parentId, childId } }, 201)
        },
    )
    .openapi(
        createRoute({
            method: 'delete',
            path: '/{id}/parents/{parentId}',
            operationId: 'removeGroupParent',
            tags: ['Groups'],
            request: { params: IdParentIdParamSchema },
            responses: {
                200: {
                    content: {
                        'application/json': {
                            schema: z.object({ data: z.object({ parentId: z.string().uuid(), childId: z.string().uuid() }) }),
                        },
                    },
                    description: 'Parent relation removed',
                },
            },
        }),
        async (c) => {
            const { id: childId, parentId } = c.req.valid('param')
            await db
                .delete(studentGroupMemberships)
                .where(
                    and(
                        eq(studentGroupMemberships.parentId, parentId),
                        eq(studentGroupMemberships.childId, childId),
                    ),
                )
            return c.json({ data: { parentId, childId } }, 200)
        },
    )
