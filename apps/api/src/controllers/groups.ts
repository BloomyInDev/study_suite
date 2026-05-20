import { zValidator } from '@hono/zod-validator'
import { eventStudentGroups, events, studentGroupMemberships, studentGroups } from '@studysuite/db'
import { and, asc, eq, gt, inArray, lt } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../db.js'
import { eventToDto } from '../lib/serialize.js'
import { OptionalDateRangeSchema } from '../schemas/query.js'

const ParentBodySchema = z.object({ parentId: z.string().uuid() })

const withRelations = {
  eventLocations: { with: { location: true as const } },
  eventTeachers: { with: { teacher: true as const } },
  eventStudentGroups: { with: { studentGroup: true as const } },
}

const withHierarchy = {
  parentMemberships: { with: { child: true as const } },
  childMemberships: { with: { parent: true as const } },
}

type GroupRef = { id: string; internalName: string }
type GroupWithHierarchy = {
  id: string
  internalName: string
  parentMemberships: { child: GroupRef }[]
  childMemberships: { parent: GroupRef }[]
}

const groupToDto = (row: GroupWithHierarchy) => ({
  id: row.id,
  internalName: row.internalName,
  children: row.parentMemberships.map(m => ({ id: m.child.id, internalName: m.child.internalName })),
  parents: row.childMemberships.map(m => ({ id: m.parent.id, internalName: m.parent.internalName })),
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
    const fromDate = from ? new Date(from) : undefined
    const toDate = to ? new Date(to) : undefined
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
        fromDate ? gt(events.startDate, fromDate) : undefined,
        toDate ? lt(events.startDate, toDate) : undefined,
      ),
      with: withRelations,
      orderBy: asc(events.startDate),
    })
    return c.json({ data: rows.map(r => eventToDto(r, dateFormat)) })
  })
  .post('/:id/parents', zValidator('json', ParentBodySchema), async (c) => {
    const childId = c.req.param('id')
    const { parentId } = c.req.valid('json')
    if (parentId === childId)
      return c.json({ error: { code: 'BAD_REQUEST', message: 'A group cannot be its own parent' } }, 400)
    const [child] = await db.select().from(studentGroups).where(eq(studentGroups.id, childId))
    if (!child) return c.json({ error: { code: 'NOT_FOUND', message: 'Group not found' } }, 404)
    const [parent] = await db.select().from(studentGroups).where(eq(studentGroups.id, parentId))
    if (!parent) return c.json({ error: { code: 'NOT_FOUND', message: 'Parent group not found' } }, 404)
    await db.insert(studentGroupMemberships).values({ parentId, childId }).onConflictDoNothing()
    return c.json({ data: { parentId, childId } }, 201)
  })
  .delete('/:id/parents/:parentId', async (c) => {
    const childId = c.req.param('id')
    const parentId = c.req.param('parentId')
    await db
      .delete(studentGroupMemberships)
      .where(and(eq(studentGroupMemberships.parentId, parentId), eq(studentGroupMemberships.childId, childId)))
    return c.json({ data: { parentId, childId } })
  })
