import { zValidator } from '@hono/zod-validator'
import { eventStudentGroups, events, studentGroups } from '@studysuite/db'
import { and, asc, eq, gt, inArray, lt } from 'drizzle-orm'
import { Hono } from 'hono'
import { db } from '../db.js'
import { eventToDto } from '../lib/serialize.js'
import { OptionalDateRangeSchema } from '../schemas/query.js'

const withRelations = {
  eventLocations: { with: { location: true as const } },
  eventTeachers: { with: { teacher: true as const } },
  eventStudentGroups: { with: { studentGroup: true as const } },
}

const app = new Hono()

app.get('/', async (c) => {
  const rows = await db.select().from(studentGroups).orderBy(asc(studentGroups.internalName))
  return c.json({ data: rows })
})

app.get('/:id', async (c) => {
  const id = c.req.param('id')
  const [row] = await db.select().from(studentGroups).where(eq(studentGroups.id, id))
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Group not found' } }, 404)
  return c.json(row)
})

app.get('/:id/events', zValidator('query', OptionalDateRangeSchema), async (c) => {
  const id = c.req.param('id')
  const { from, to, dateFormat } = c.req.valid('query')
  const [group] = await db.select().from(studentGroups).where(eq(studentGroups.id, id))
  if (!group) return c.json({ error: { code: 'NOT_FOUND', message: 'Group not found' } }, 404)
  const rows = await db.query.events.findMany({
    where: and(
      inArray(
        events.id,
        db
          .select({ id: eventStudentGroups.eventId })
          .from(eventStudentGroups)
          .where(eq(eventStudentGroups.studentGroupId, id)),
      ),
      from ? gt(events.startDate, from) : undefined,
      to ? lt(events.startDate, to) : undefined,
    ),
    with: withRelations,
    orderBy: asc(events.startDate),
  })
  return c.json({ data: rows.map(r => eventToDto(r, dateFormat)) })
})

export default app
