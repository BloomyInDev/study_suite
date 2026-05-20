import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../../db.js'
import { discordRoleMappings, studentGroups } from '@studysuite/db'
import { requireAuth, requireAdmin, type AuthEnv } from '../../middleware/auth.js'

const createSchema = z.object({
  discordGuildId: z.string().min(1),
  discordRoleId: z.string().min(1),
  studentGroupId: z.string().uuid(),
})

export default new Hono<AuthEnv>()
  .use(requireAuth, requireAdmin)

  .get('/', async (c) => {
    const mappings = await db
      .select({
        id: discordRoleMappings.id,
        discordGuildId: discordRoleMappings.discordGuildId,
        discordRoleId: discordRoleMappings.discordRoleId,
        studentGroupId: discordRoleMappings.studentGroupId,
        studentGroupName: studentGroups.internalName,
        createdAt: discordRoleMappings.createdAt,
      })
      .from(discordRoleMappings)
      .leftJoin(studentGroups, eq(discordRoleMappings.studentGroupId, studentGroups.id))
      .orderBy(discordRoleMappings.createdAt)
    return c.json({ data: mappings })
  })

  .post('/', zValidator('json', createSchema), async (c) => {
    const body = c.req.valid('json')
    const [created] = await db.insert(discordRoleMappings).values(body).returning()
    return c.json({ data: created }, 201)
  })

  .delete('/:id', async (c) => {
    const id = c.req.param('id')
    const [deleted] = await db.delete(discordRoleMappings)
      .where(eq(discordRoleMappings.id, id))
      .returning()
    if (!deleted) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Mapping not found' } }, 404)
    }
    return c.json({ data: deleted })
  })
