import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../../db.js'
import { users } from '@studysuite/db'
import { requireAuth, requireAdmin, type AuthEnv } from '../../middleware/auth.js'

const patchSchema = z.object({
  status: z.enum(['approved', 'rejected']).optional(),
  role: z.enum(['student', 'teacher']).optional(),
  studentGroupId: z.string().uuid().nullable().optional(),
  teacherId: z.string().uuid().nullable().optional(),
  isAdmin: z.boolean().optional(),
})

export default new Hono<AuthEnv>()
  .use(requireAuth, requireAdmin)

  .get('/', async (c) => {
    const all = await db.select().from(users).orderBy(users.createdAt)
    return c.json({ data: all })
  })

  .patch('/:id', zValidator('json', patchSchema), async (c) => {
    const id = c.req.param('id')
    const body = c.req.valid('json')
    const [updated] = await db.update(users)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning()
    if (!updated) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'User not found' } }, 404)
    }
    return c.json({ data: updated })
  })
