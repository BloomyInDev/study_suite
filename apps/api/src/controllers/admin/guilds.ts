import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { eq } from 'drizzle-orm'
import { db } from '../../db.js'
import { discordGuilds, discordRoleMappings, studentGroups } from '@studysuite/db'
import { requireAuth, requireAdmin, type AuthEnv } from '../../middleware/auth.js'
import { ErrorSchema, IdParamSchema } from '../../schemas/responses.js'

const createSchema = z.object({
    discordGuildId: z.string().min(1),
    name: z.string().min(1),
})

const MappingBodySchema = z.discriminatedUnion('userRole', [
    z.object({
        discordRoleId: z.string().min(1),
        userRole: z.literal('student'),
        studentGroupId: z.string().uuid(),
    }),
    z.object({
        discordRoleId: z.string().min(1),
        userRole: z.literal('teacher'),
        studentGroupId: z.string().uuid().optional(),
    }),
])

const GuildSchema = z.object({
    id: z.string().uuid(),
    discordGuildId: z.string(),
    name: z.string(),
    createdAt: z.string(),
})

const MappingSchema = z.object({
    id: z.string().uuid(),
    guildId: z.string().uuid(),
    discordRoleId: z.string(),
    userRole: z.enum(['student', 'teacher']),
    studentGroupId: z.string().uuid().nullable(),
    studentGroupName: z.string().nullable(),
    createdAt: z.string(),
})

const GuildWithMappingsSchema = GuildSchema.extend({ mappings: z.array(MappingSchema) })

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
        tags: ['Admin'],
        security: [{ Bearer: [] }],
        responses: {
            200: {
                content: { 'application/json': { schema: z.object({ data: z.array(GuildWithMappingsSchema) }) } },
                description: 'All Discord guilds with role mappings',
            },
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
        tags: ['Admin'],
        security: [{ Bearer: [] }],
        request: {
            body: { content: { 'application/json': { schema: createSchema } }, required: true },
        },
        responses: {
            201: {
                content: { 'application/json': { schema: z.object({ data: GuildWithMappingsSchema }) } },
                description: 'Created guild',
            },
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
        tags: ['Admin'],
        security: [{ Bearer: [] }],
        request: { params: IdParamSchema },
        responses: {
            200: { content: { 'application/json': { schema: z.object({ data: GuildSchema }) } }, description: 'Deleted guild' },
            404: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Not found' },
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
        tags: ['Admin'],
        security: [{ Bearer: [] }],
        request: {
            params: IdParamSchema,
            body: { content: { 'application/json': { schema: MappingBodySchema } }, required: true },
        },
        responses: {
            201: { content: { 'application/json': { schema: z.object({ data: MappingSchema }) } }, description: 'Created mapping' },
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
        tags: ['Admin'],
        security: [{ Bearer: [] }],
        request: { params: IdMappingIdParamSchema },
        responses: {
            200: { content: { 'application/json': { schema: z.object({ data: MappingSchema }) } }, description: 'Deleted mapping' },
            404: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Not found' },
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
