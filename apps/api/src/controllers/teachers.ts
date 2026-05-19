import { zValidator } from '@hono/zod-validator'
import { eventTeachers, events, teachers } from '@studysuite/db'
import { and, asc, eq, gte, ilike, inArray, lt, or } from 'drizzle-orm'
import { Hono } from 'hono'
import { db } from '../db.js'
import { eventToDto } from '../lib/serialize.js'
import { OptionalDateRangeSchema, SearchSchema } from '../schemas/query.js'

const withRelations = {
  eventLocations: { with: { location: true as const } },
  eventTeachers: { with: { teacher: true as const } },
  eventStudentGroups: { with: { studentGroup: true as const } },
}

const app = new Hono()

app.get('/search', zValidator('query', SearchSchema), async (c) => {
  const { q } = c.req.valid('query')
  const rows = await db
    .select()
    .from(teachers)
    .where(or(ilike(teachers.firstName, `%${q}%`), ilike(teachers.lastName, `%${q}%`)))
    .orderBy(asc(teachers.lastName), asc(teachers.firstName))
  return c.json({ data: rows })
})

app.get('/', async (c) => {
  const rows = await db.select().from(teachers).orderBy(asc(teachers.lastName), asc(teachers.firstName))
  return c.json({ data: rows })
})

app.get('/:id', async (c) => {
  const id = c.req.param('id')
  const [row] = await db.select().from(teachers).where(eq(teachers.id, id))
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Teacher not found' } }, 404)
  return c.json(row)
})

app.get('/:id/events', zValidator('query', OptionalDateRangeSchema), async (c) => {
  const id = c.req.param('id')
  const { from, to, dateFormat } = c.req.valid('query')
  const [teacher] = await db.select().from(teachers).where(eq(teachers.id, id))
  if (!teacher) return c.json({ error: { code: 'NOT_FOUND', message: 'Teacher not found' } }, 404)
  const conditions = [
    inArray(
      events.id,
      db.select({ id: eventTeachers.eventId }).from(eventTeachers).where(eq(eventTeachers.teacherId, id)),
    ),
  ]
  if (from) conditions.push(gte(events.startDate, from))
  if (to) conditions.push(lt(events.startDate, to))
  const rows = await db.query.events.findMany({
    where: and(...conditions),
    with: withRelations,
    orderBy: asc(events.startDate),
  })
  return c.json({ data: rows.map(r => eventToDto(r, dateFormat)) })
})

export default app
