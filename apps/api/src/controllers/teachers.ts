import { zValidator } from '@hono/zod-validator'
import { eventTeachers, events, teachers } from '@studysuite/db'
import { and, asc, eq, gte, ilike, inArray, lt, lte, or } from 'drizzle-orm'
import { Hono } from 'hono'
import { db } from '../db.js'
import { eventToDto } from '../lib/serialize.js'
import { DateFormatSchema, OptionalDateRangeSchema, SearchSchema } from '../schemas/query.js'
import { dateToUTC } from '../lib/date.js'

const withRelations = {
  eventLocations: { with: { location: true as const } },
  eventTeachers: { with: { teacher: true as const } },
  eventStudentGroups: { with: { studentGroup: true as const } },
}

async function busyTeacherIds(at: Date): Promise<Set<string>> {
  const rows = await db
    .selectDistinct({ teacherId: eventTeachers.teacherId })
    .from(eventTeachers)
    .innerJoin(events, eq(eventTeachers.eventId, events.id))
    .where(and(lte(events.startDate, at), gte(events.endDate, at)))
  return new Set(rows.map((r) => r.teacherId))
}

export default new Hono()
  .get('/search', zValidator('query', SearchSchema), async (c) => {
    const { q } = c.req.valid('query')
    const rows = await db
      .select()
      .from(teachers)
      .where(or(ilike(teachers.firstName, `%${q}%`), ilike(teachers.lastName, `%${q}%`)))
      .orderBy(asc(teachers.lastName), asc(teachers.firstName))
    return c.json({ data: rows })
  })
  .get('/', async (c) => {
    const now = dateToUTC(new Date())
    const [rows, busy] = await Promise.all([
      db.select().from(teachers).orderBy(asc(teachers.lastName), asc(teachers.firstName)),
      busyTeacherIds(now),
    ])
    return c.json({ data: rows.map((t) => ({ ...t, available: !busy.has(t.id) })) })
  })
  .get('/:id', async (c) => {
    const id = c.req.param('id')
    const dateFormat = DateFormatSchema.parse(c.req.query('dateFormat'))
    const [row] = await db.select().from(teachers).where(eq(teachers.id, id))
    if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Teacher not found' } }, 404)
    const now = dateToUTC(new Date())
    const currentEvents = await db.query.events.findMany({
      where: and(
        inArray(
          events.id,
          db
            .select({ id: eventTeachers.eventId })
            .from(eventTeachers)
            .where(eq(eventTeachers.teacherId, id)),
        ),
        lte(events.startDate, now),
        gte(events.endDate, now),
      ),
      with: withRelations,
    })
    const currentEvent = currentEvents[0] ? eventToDto(currentEvents[0], dateFormat) : null
    return c.json({ data: { ...row, available: currentEvent === null, currentEvent } })
  })
  .get('/:id/events', zValidator('query', OptionalDateRangeSchema), async (c) => {
    const id = c.req.param('id')
    const { from, to, dateFormat } = c.req.valid('query')
    const [teacher] = await db.select().from(teachers).where(eq(teachers.id, id))
    if (!teacher) return c.json({ error: { code: 'NOT_FOUND', message: 'Teacher not found' } }, 404)
    const conditions = [
      inArray(
        events.id,
        db
          .select({ id: eventTeachers.eventId })
          .from(eventTeachers)
          .where(eq(eventTeachers.teacherId, id)),
      ),
    ]
    if (from) conditions.push(gte(events.startDate, from))
    if (to) conditions.push(lt(events.startDate, to))
    const rows = await db.query.events.findMany({
      where: and(...conditions),
      with: withRelations,
      orderBy: asc(events.startDate),
    })
    return c.json({ data: rows.map((r) => eventToDto(r, dateFormat)) })
  })
