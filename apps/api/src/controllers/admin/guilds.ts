import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../../db.js'
import { discordGuilds, discordRoleMappings, studentGroups } from '@studysuite/db'
import { requireAuth, requireAdmin, type AuthEnv } from '../../middleware/auth.js'

const createSchema = z.object({
    discordGuildId: z.string().min(1),
    name: z.string().min(1),
})

export default new Hono<AuthEnv>()
    .use(requireAuth, requireAdmin)

    .get('/', async (c) => {
        const guilds = await db.select().from(discordGuilds).orderBy(discordGuilds.name)
        const mappings = await db
            .select({
                id: discordRoleMappings.id,
                guildId: discordRoleMappings.guildId,
                discordRoleId: discordRoleMappings.discordRoleId,
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
        return c.json({ data: result })
    })

    .post('/', zValidator('json', createSchema), async (c) => {
        const body = c.req.valid('json')
        const [created] = await db.insert(discordGuilds).values(body).returning()
        return c.json({ data: { ...created, mappings: [] } }, 201)
    })

    .delete('/:id', async (c) => {
        const id = c.req.param('id')
        const [deleted] = await db.delete(discordGuilds).where(eq(discordGuilds.id, id)).returning()
        if (!deleted) {
            return c.json({ error: { code: 'NOT_FOUND', message: 'Guild not found' } }, 404)
        }
        return c.json({ data: deleted })
    })

    .post(
        '/:id/mappings',
        zValidator(
            'json',
            z.object({
                discordRoleId: z.string().min(1),
                studentGroupId: z.string().uuid(),
            }),
        ),
        async (c) => {
            const guildId = c.req.param('id')
            const body = c.req.valid('json')
            const [created] = await db
                .insert(discordRoleMappings)
                .values({ guildId, ...body })
                .returning()
            return c.json({ data: created }, 201)
        },
    )

    .delete('/:id/mappings/:mappingId', async (c) => {
        const mappingId = c.req.param('mappingId')
        const [deleted] = await db
            .delete(discordRoleMappings)
            .where(eq(discordRoleMappings.id, mappingId))
            .returning()
        if (!deleted) {
            return c.json({ error: { code: 'NOT_FOUND', message: 'Mapping not found' } }, 404)
        }
        return c.json({ data: deleted })
    })
