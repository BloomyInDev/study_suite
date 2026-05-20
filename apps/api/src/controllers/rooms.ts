import { zValidator } from '@hono/zod-validator'
import { eventLocations, events, locations } from '@studysuite/db'
import { and, asc, eq, gt, inArray, lt, notInArray } from 'drizzle-orm'
import { Hono } from 'hono'
import { db } from '../db.js'
import { eventToDto } from '../lib/serialize.js'
import { DateRangeSchema, OptionalDateRangeSchema } from '../schemas/query.js'

const withRelations = {
  eventLocations: { with: { location: true as const } },
  eventTeachers: { with: { teacher: true as const } },
  eventStudentGroups: { with: { studentGroup: true as const } },
}

export default new Hono()
  .get('/available', zValidator('query', DateRangeSchema), async (c) => {
    const { from, to } = c.req.valid('query')
    const busyRows = await db
      .selectDistinct({ id: eventLocations.locationId })
      .from(eventLocations)
      .innerJoin(events, eq(eventLocations.eventId, events.id))
      .where(and(lt(events.startDate, to), gt(events.endDate, from)))
    const busyIds = busyRows.map(r => r.id)
    const rows = await db
      .select()
      .from(locations)
      .where(busyIds.length > 0 ? notInArray(locations.id, busyIds) : undefined)
      .orderBy(asc(locations.name))
    return c.json({ data: rows })
  })
  .get('/', async (c) => {
    const rows = await db.select().from(locations).orderBy(asc(locations.name))
    return c.json({ data: rows })
  })
  .get('/:id', async (c) => {
    const id = c.req.param('id')
    const [row] = await db.select().from(locations).where(eq(locations.id, id))
    if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Room not found' } }, 404)
    return c.json(row)
  })
  .get('/:id/events', zValidator('query', OptionalDateRangeSchema), async (c) => {
    const id = c.req.param('id')
    const { from, to, dateFormat } = c.req.valid('query')
    const fromDate = from ? new Date(from) : undefined
    const toDate = to ? new Date(to) : undefined
    const [room] = await db.select().from(locations).where(eq(locations.id, id))
    if (!room) return c.json({ error: { code: 'NOT_FOUND', message: 'Room not found' } }, 404)
    const rows = await db.query.events.findMany({
      where: and(
        inArray(
          events.id,
          db.select({ id: eventLocations.eventId }).from(eventLocations).where(eq(eventLocations.locationId, id)),
        ),
        fromDate ? gt(events.startDate, fromDate) : undefined,
        toDate ? lt(events.startDate, toDate) : undefined,
      ),
      with: withRelations,
      orderBy: asc(events.startDate),
    })
    return c.json({ data: rows.map(r => eventToDto(r, dateFormat)) })
  })
