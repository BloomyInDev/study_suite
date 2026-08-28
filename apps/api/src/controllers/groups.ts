import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import {
    assignments,
    discordRoleMappings,
    eventStudentGroups,
    events,
    studentGroupMemberships,
    studentGroups,
} from '@studysuite/db'
import { and, asc, eq, gt, inArray, lt } from 'drizzle-orm'
import { db } from '../db.js'
import { eventToDto, withEventRelations } from '../lib/serialize.js'
import { OptionalDateRangeSchema } from '../schemas/query.js'
import { ErrorSchema, EventDtoSchema, GroupSchema, IdParamSchema } from '../schemas/responses.js'

const ParentBodySchema = z.object({ parentId: z.string().uuid() })

const ListGroupsQuerySchema = z.object({
    includeHidden: z
        .enum(['true', 'false'])
        .optional()
        .transform((v) => v === 'true')
        .openapi({ param: { name: 'includeHidden', in: 'query' } }),
})

const CreateGroupBodySchema = z.object({
    internalName: z.string().trim().min(1),
    displayName: z.string().trim().min(1).nullable().optional(),
    hidden: z.boolean().optional(),
})

const DeleteGroupQuerySchema = z.object({
    force: z
        .enum(['true', 'false'])
        .optional()
        .transform((v) => v === 'true')
        .openapi({ param: { name: 'force', in: 'query' } }),
})

const UpdateGroupBodySchema = z.object({
    displayName: z.string().trim().min(1).nullable().optional(),
    hidden: z.boolean().optional(),
})

const IdParentIdParamSchema = z.object({
    id: z.string().uuid().openapi({ param: { name: 'id', in: 'path' } }),
    parentId: z.string().uuid().openapi({ param: { name: 'parentId', in: 'path' } }),
})

const withHierarchy = {
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

const toRef = (g: GroupRef) => ({ id: g.id, internalName: g.internalName, displayName: g.displayName })

const groupToDto = (row: GroupWithHierarchy) => ({
    id: row.id,
    internalName: row.internalName,
    displayName: row.displayName,
    hidden: row.hidden,
    children: row.parentMemberships.map((m) => toRef(m.child)),
    parents: row.childMemberships.map((m) => toRef(m.parent)),
})

export default new OpenAPIHono()
    .openapi(
        createRoute({
            method: 'get',
            path: '/',
            operationId: 'listGroups',
            tags: ['Groups'],
            request: { query: ListGroupsQuerySchema },
            responses: {
                200: {
                    content: { 'application/json': { schema: z.object({ data: z.array(GroupSchema) }) } },
                    description: 'All groups with hierarchy',
                },
            },
        }),
        async (c) => {
            const { includeHidden } = c.req.valid('query')
            const rows = await db.query.studentGroups.findMany({
                where: includeHidden ? undefined : eq(studentGroups.hidden, false),
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
            method: 'patch',
            path: '/{id}',
            operationId: 'updateGroup',
            tags: ['Groups'],
            request: {
                params: IdParamSchema,
                body: {
                    content: { 'application/json': { schema: UpdateGroupBodySchema } },
                    required: true,
                },
            },
            responses: {
                200: {
                    content: { 'application/json': { schema: z.object({ data: GroupSchema }) } },
                    description: 'Updated group',
                },
                404: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Not found' },
            },
        }),
        async (c) => {
            const { id } = c.req.valid('param')
            const body = c.req.valid('json')

            const patch: { displayName?: string | null; hidden?: boolean } = {}
            if (body.displayName !== undefined) patch.displayName = body.displayName
            if (body.hidden !== undefined) patch.hidden = body.hidden
            if (Object.keys(patch).length > 0) {
                await db.update(studentGroups).set(patch).where(eq(studentGroups.id, id))
            }

            const row = await db.query.studentGroups.findFirst({
                where: eq(studentGroups.id, id),
                with: withHierarchy,
            })
            if (!row) {
                return c.json(
                    { error: { code: 'NOT_FOUND', message: 'Group not found' } },
                    404,
                )
            }
            return c.json({ data: groupToDto(row) }, 200)
        },
    )
    .openapi(
        createRoute({
            method: 'post',
            path: '/',
            operationId: 'createGroup',
            tags: ['Groups'],
            request: {
                body: {
                    content: { 'application/json': { schema: CreateGroupBodySchema } },
                    required: true,
                },
            },
            responses: {
                201: {
                    content: { 'application/json': { schema: z.object({ data: GroupSchema }) } },
                    description: 'Group created',
                },
                409: {
                    content: { 'application/json': { schema: ErrorSchema } },
                    description: 'A group with that internal name already exists',
                },
            },
        }),
        async (c) => {
            const body = c.req.valid('json')

            const existing = await db.query.studentGroups.findFirst({
                where: eq(studentGroups.internalName, body.internalName),
            })
            if (existing) {
                return c.json(
                    {
                        error: {
                            code: 'GROUP_EXISTS',
                            message: `A group named "${body.internalName}" already exists`,
                        },
                    },
                    409,
                )
            }

            const [created] = await db
                .insert(studentGroups)
                .values({
                    internalName: body.internalName,
                    displayName: body.displayName ?? null,
                    hidden: body.hidden ?? false,
                })
                .returning()

            return c.json(
                {
                    data: {
                        id: created!.id,
                        internalName: created!.internalName,
                        displayName: created!.displayName,
                        hidden: created!.hidden,
                        parents: [],
                        children: [],
                    },
                },
                201,
            )
        },
    )
    .openapi(
        createRoute({
            method: 'delete',
            path: '/{id}',
            operationId: 'deleteGroup',
            tags: ['Groups'],
            request: { params: IdParamSchema, query: DeleteGroupQuerySchema },
            responses: {
                200: {
                    content: {
                        'application/json': {
                            schema: z.object({ data: z.object({ id: z.string().uuid() }) }),
                        },
                    },
                    description: 'Group deleted',
                },
                404: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Not found' },
                409: {
                    content: { 'application/json': { schema: ErrorSchema } },
                    description: 'Group still carries data that would be deleted with it',
                },
            },
        }),
        async (c) => {
            const { id } = c.req.valid('param')
            const { force } = c.req.valid('query')

            const group = await db.query.studentGroups.findFirst({
                where: eq(studentGroups.id, id),
            })
            if (!group) {
                return c.json({ error: { code: 'NOT_FOUND', message: 'Group not found' } }, 404)
            }

            // Deleting cascades: assignments and discord role mappings go with it,
            // and members lose their group. Event links just unlink and are rescraped.
            if (!force) {
                const [assignmentRows, mappingRows] = await Promise.all([
                    db.select({ id: assignments.id }).from(assignments).where(eq(assignments.studentGroupId, id)),
                    db
                        .select({ id: discordRoleMappings.id })
                        .from(discordRoleMappings)
                        .where(eq(discordRoleMappings.studentGroupId, id)),
                ])
                if (assignmentRows.length > 0 || mappingRows.length > 0) {
                    return c.json(
                        {
                            error: {
                                code: 'GROUP_IN_USE',
                                message:
                                    `Deleting "${group.internalName}" would also delete ` +
                                    `${assignmentRows.length} devoir(s) and ${mappingRows.length} ` +
                                    `mapping(s) Discord. Retry with force=true to confirm.`,
                            },
                        },
                        409,
                    )
                }
            }

            await db.delete(studentGroups).where(eq(studentGroups.id, id))
            return c.json({ data: { id } }, 200)
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
