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

const withHierarchy = {
  parentMemberships: { with: { child: true as const } },
  childMemberships: { with: { parent: true as const } },
}

const groupToDto = (row: Awaited<ReturnType<typeof db.query.studentGroups.findFirst>> & object) => ({
  id: row.id,
  internalName: row.internalName,
  children: 'parentMemberships' in row
    ? (row as any).parentMemberships.map((m: any) => ({ id: m.child.id, internalName: m.child.internalName }))
    : [],
  parents: 'childMemberships' in row
    ? (row as any).childMemberships.map((m: any) => ({ id: m.parent.id, internalName: m.parent.internalName }))
    : [],
})

export default new Hono()
  .get('/', async (c) => {
    const rows = await db.query.studentGroups.findMany({
      with: withHierarchy,
      orderBy: asc(studentGroups.internalName),
    })
    return c.json({ data: rows.map(groupToDto) })
  })
  .get('/:id', async (c) => {
    const id = c.req.param('id')
    const row = await db.query.studentGroups.findFirst({
      where: eq(studentGroups.id, id),
      with: withHierarchy,
    })
    if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Group not found' } }, 404)
    return c.json({ data: groupToDto(row) })
  })
  .get('/:id/events', zValidator('query', OptionalDateRangeSchema), async (c) => {
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
