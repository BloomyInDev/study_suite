import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { eq } from 'drizzle-orm'
import { db } from '../../db.js'
import { discordGuilds, discordRoleMappings, studentGroups } from '@studysuite/db'
import { requireAuth, requireAdmin, type AuthEnv } from '../../middleware/auth.js'
import { IdParamSchema, dataResponse, errorResponse } from '../../schemas/responses.js'

const createGuildSchema = z
    .object({
        discordGuildId: z.string().min(1).openapi({ example: '705623509884796939' }),
        name: z.string().min(1).openapi({ example: 'BUT Info Montpellier' }),
    })
    .openapi('CreateGuild')

const MappingBodySchema = z
    .discriminatedUnion('userRole', [
        z.object({
            discordRoleId: z.string().min(1).openapi({ example: '812340987654321098' }),
            userRole: z.literal('student'),
            studentGroupId: z.string().uuid().openapi({ example: '4d8b6a2c-7e1f-4a3b-9c5d-8e0f2a4b6c8d' }),
        }),
        z.object({
            discordRoleId: z.string().min(1).openapi({ example: '812340987654321098' }),
            userRole: z.literal('teacher'),
            studentGroupId: z.string().uuid().optional(),
        }),
    ])
    .openapi('CreateMapping')

const GuildSchema = z
    .object({
        id: z.string().uuid().openapi({ example: '3e5a7c9b-1d2f-4e6a-8b0c-2d4f6a8b0c2e' }),
        discordGuildId: z.string().openapi({ example: '705623509884796939' }),
        name: z.string().openapi({ example: 'BUT Info Montpellier' }),
        createdAt: z.string().openapi({ example: '2026-08-20T14:03:11.000Z' }),
    })
    .openapi('Guild')

const MappingSchema = z
    .object({
        id: z.string().uuid(),
        guildId: z.string().uuid(),
        discordRoleId: z.string(),
        userRole: z.enum(['student', 'teacher']),
        studentGroupId: z.string().uuid().nullable(),
        studentGroupName: z.string().nullable(),
        createdAt: z.string(),
    })
    .openapi('GuildRoleMapping')

const GuildWithMappingsSchema = GuildSchema.extend({ mappings: z.array(MappingSchema) }).openapi('GuildWithMappings')

const IdMappingIdParamSchema = z.object({
    id: z.string().uuid().openapi({ param: { name: 'id', in: 'path' } }),
    mappingId: z.string().uuid().openapi({ param: { name: 'mappingId', in: 'path' } }),
})

const app = new OpenAPIHono<AuthEnv>()
app.use(requireAuth, requireAdmin)

app.openapi(
    createRoute({
        method: 'get',
        path: '/',
        operationId: 'adminListGuilds',
        summary: 'List configured Discord servers and their mappings',
        tags: ['Admin'],
        security: [{ Bearer: [] }],
        responses: {
            200: dataResponse(z.array(GuildWithMappingsSchema), 'All Discord guilds with role mappings'),
            401: errorResponse('Unauthorized'),
        },
    }),
    async (c) => {
        const guilds = await db.select().from(discordGuilds).orderBy(discordGuilds.name)
        const mappings = await db
            .select({
                id: discordRoleMappings.id,
                guildId: discordRoleMappings.guildId,
                discordRoleId: discordRoleMappings.discordRoleId,
                userRole: discordRoleMappings.userRole,
                studentGroupId: discordRoleMappings.studentGroupId,
                studentGroupName: studentGroups.internalName,
                createdAt: discordRoleMappings.createdAt,
            })
            .from(discordRoleMappings)
            .leftJoin(studentGroups, eq(discordRoleMappings.studentGroupId, studentGroups.id))

        const result = guilds.map((g) => ({
            ...g,
            mappings: mappings.filter((m) => m.guildId === g.id),
        }))
        return c.json({ data: result }, 200)
    },
)

app.openapi(
    createRoute({
        method: 'post',
        path: '/',
        operationId: 'adminCreateGuild',
        summary: 'Configure a Discord server',
        tags: ['Admin'],
        security: [{ Bearer: [] }],
        request: {
            body: { content: { 'application/json': { schema: createGuildSchema } }, required: true },
        },
        responses: {
            201: dataResponse(GuildWithMappingsSchema, 'Created guild'),
            401: errorResponse('Unauthorized'),
        },
    }),
    async (c) => {
        const body = c.req.valid('json')
        const [created] = await db.insert(discordGuilds).values(body).returning()
        return c.json({ data: { ...created, mappings: [] } }, 201)
    },
)

app.openapi(
    createRoute({
        method: 'delete',
        path: '/{id}',
        operationId: 'adminDeleteGuild',
        summary: 'Remove a Discord server',
        tags: ['Admin'],
        security: [{ Bearer: [] }],
        request: { params: IdParamSchema },
        responses: {
            200: dataResponse(GuildSchema, 'Deleted guild'),
            401: errorResponse('Unauthorized'),
            404: errorResponse('Not found'),
        },
    }),
    async (c) => {
        const { id } = c.req.valid('param')
        const [deleted] = await db.delete(discordGuilds).where(eq(discordGuilds.id, id)).returning()
        if (!deleted) {
            return c.json({ error: { code: 'NOT_FOUND', message: 'Guild not found' } }, 404)
        }
        return c.json({ data: deleted }, 200)
    },
)

app.openapi(
    createRoute({
        method: 'post',
        path: '/{id}/mappings',
        operationId: 'adminCreateMapping',
        summary: 'Map a Discord role to a student group',
        tags: ['Admin'],
        security: [{ Bearer: [] }],
        request: {
            params: IdParamSchema,
            body: { content: { 'application/json': { schema: MappingBodySchema } }, required: true },
        },
        responses: {
            201: dataResponse(MappingSchema, 'Created mapping'),
            401: errorResponse('Unauthorized'),
        },
    }),
    async (c) => {
        const guildId = c.req.valid('param').id
        const body = c.req.valid('json')
        const [created] = await db
            .insert(discordRoleMappings)
            .values({ guildId, ...body })
            .returning()
        return c.json({ data: { ...created, studentGroupName: null } }, 201)
    },
)

app.openapi(
    createRoute({
        method: 'delete',
        path: '/{id}/mappings/{mappingId}',
        operationId: 'adminDeleteMapping',
        summary: 'Remove a Discord role mapping',
        tags: ['Admin'],
        security: [{ Bearer: [] }],
        request: { params: IdMappingIdParamSchema },
        responses: {
            200: dataResponse(MappingSchema, 'Deleted mapping'),
            401: errorResponse('Unauthorized'),
            404: errorResponse('Not found'),
        },
    }),
    async (c) => {
        const { mappingId } = c.req.valid('param')
        const [deleted] = await db
            .delete(discordRoleMappings)
            .where(eq(discordRoleMappings.id, mappingId))
            .returning()
        if (!deleted) {
            return c.json({ error: { code: 'NOT_FOUND', message: 'Mapping not found' } }, 404)
        }
        return c.json({ data: { ...deleted, studentGroupName: null } }, 200)
    },
)

export default app
