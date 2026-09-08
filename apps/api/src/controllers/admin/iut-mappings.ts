import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { eq } from 'drizzle-orm'
import { db } from '../../db.js'
import { iutGroupMappings, studentGroups } from '@studysuite/db'
import { requireAuth, requireAdmin, type AuthEnv } from '../../middleware/auth.js'
import { IdParamSchema, dataResponse, errorResponse } from '../../schemas/responses.js'

const MappingBodySchema = z
    .discriminatedUnion('userRole', [
        z.object({
            claimValue: z.string().min(1).openapi({ example: 'ann3' }),
            userRole: z.literal('student'),
            studentGroupId: z
                .string()
                .uuid()
                .openapi({ example: '4d8b6a2c-7e1f-4a3b-9c5d-8e0f2a4b6c8d' }),
        }),
        z.object({
            claimValue: z.string().min(1).openapi({ example: 'enseignants' }),
            userRole: z.literal('teacher'),
            studentGroupId: z.string().uuid().optional(),
        }),
    ])
    .openapi('CreateIutGroupMapping')

const MappingSchema = z
    .object({
        id: z.string().uuid(),
        claimValue: z.string().openapi({ example: 'ann3' }),
        userRole: z.enum(['student', 'teacher']),
        studentGroupId: z.string().uuid().nullable(),
        studentGroupName: z.string().nullable(),
        createdAt: z.string(),
    })
    .openapi('IutGroupMapping')

const app = new OpenAPIHono<AuthEnv>()
app.use(requireAuth, requireAdmin)

const selectMappings = () =>
    db
        .select({
            id: iutGroupMappings.id,
            claimValue: iutGroupMappings.claimValue,
            userRole: iutGroupMappings.userRole,
            studentGroupId: iutGroupMappings.studentGroupId,
            studentGroupName: studentGroups.displayName,
            createdAt: iutGroupMappings.createdAt,
        })
        .from(iutGroupMappings)
        .leftJoin(studentGroups, eq(studentGroups.id, iutGroupMappings.studentGroupId))
        .orderBy(iutGroupMappings.claimValue)

app.openapi(
    createRoute({
        method: 'get',
        path: '/',
        operationId: 'adminListIutMappings',
        summary: 'List the IUT directory group mappings',
        description:
            "Each row maps one entry of the bridge's `groups` claim to a role and an anchor class.",
        tags: ['Admin'],
        security: [{ Bearer: [] }],
        responses: {
            200: dataResponse(z.array(MappingSchema), 'All IUT group mappings'),
            401: errorResponse('Unauthorized'),
        },
    }),
    async (c) => {
        const rows = await selectMappings()
        return c.json(
            { data: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })) },
            200,
        )
    },
)

app.openapi(
    createRoute({
        method: 'post',
        path: '/',
        operationId: 'adminCreateIutMapping',
        summary: 'Map an IUT directory group to a role and a class',
        tags: ['Admin'],
        security: [{ Bearer: [] }],
        request: {
            body: {
                content: { 'application/json': { schema: MappingBodySchema } },
                required: true,
            },
        },
        responses: {
            201: dataResponse(MappingSchema, 'Created mapping'),
            401: errorResponse('Unauthorized'),
            409: errorResponse('Already mapped'),
        },
    }),
    async (c) => {
        const body = c.req.valid('json')
        // The claim is matched case-insensitively, so it is stored folded.
        const claimValue = body.claimValue.trim().toLowerCase()

        const existing = await db
            .select({ id: iutGroupMappings.id })
            .from(iutGroupMappings)
            .where(eq(iutGroupMappings.claimValue, claimValue))
            .limit(1)
        if (existing.length > 0) {
            return c.json(
                { error: { code: 'CONFLICT', message: 'That group is already mapped' } },
                409,
            )
        }

        const [created] = await db
            .insert(iutGroupMappings)
            .values({
                claimValue,
                userRole: body.userRole,
                studentGroupId: body.userRole === 'student' ? body.studentGroupId : null,
            })
            .returning({ id: iutGroupMappings.id })

        const [row] = await selectMappings().where(eq(iutGroupMappings.id, created.id))
        return c.json({ data: { ...row, createdAt: row.createdAt.toISOString() } }, 201)
    },
)

app.openapi(
    createRoute({
        method: 'delete',
        path: '/{id}',
        operationId: 'adminDeleteIutMapping',
        summary: 'Remove an IUT directory group mapping',
        tags: ['Admin'],
        security: [{ Bearer: [] }],
        request: { params: IdParamSchema },
        responses: {
            200: dataResponse(z.object({ id: z.string().uuid() }), 'Deleted mapping'),
            401: errorResponse('Unauthorized'),
            404: errorResponse('Not found'),
        },
    }),
    async (c) => {
        const { id } = c.req.valid('param')
        const deleted = await db
            .delete(iutGroupMappings)
            .where(eq(iutGroupMappings.id, id))
            .returning({ id: iutGroupMappings.id })
        if (deleted.length === 0) {
            return c.json({ error: { code: 'NOT_FOUND', message: 'Mapping not found' } }, 404)
        }
        return c.json({ data: { id: deleted[0].id } }, 200)
    },
)

export default app
