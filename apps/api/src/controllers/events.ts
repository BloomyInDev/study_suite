import { zValidator } from '@hono/zod-validator'
import { eventLocations, eventStudentGroups, eventTeachers, events } from '@studysuite/db'
import { and, asc, eq, gte, inArray, lt } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../db.js'
import { dayEndUTC, dayStartUTC, weekMondayUTC } from '../lib/date.js'
import { eventToDto } from '../lib/serialize.js'
import {
    DateFormatSchema,
    DateParamSchema,
    FilteredEventsSchema,
    LimitSchema,
} from '../schemas/query.js'

const withRelations = {
    eventLocations: { with: { location: true as const } },
    eventTeachers: { with: { teacher: true as const } },
    eventStudentGroups: { with: { studentGroup: true as const } },
}

export default new Hono()
    .get('/titles', async (c) => {
        const rows = await db
            .selectDistinct({ title: events.title })
            .from(events)
            .orderBy(asc(events.title))
        return c.json({ data: rows.map((r) => r.title) })
    })

    .get('/week', zValidator('query', DateParamSchema), async (c) => {
        const { date, dateFormat } = c.req.valid('query')
        const from = weekMondayUTC(new Date(date))
        const to = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000)
        const rows = await db.query.events.findMany({
            where: and(gte(events.startDate, from), lt(events.startDate, to)),
            with: withRelations,
            orderBy: asc(events.startDate),
        })
        return c.json({ data: rows.map((r) => eventToDto(r, dateFormat)) })
    })
    .get('/day', zValidator('query', DateParamSchema), async (c) => {
        const { date, dateFormat } = c.req.valid('query')
        const from = dayStartUTC(new Date(date))
        const to = dayEndUTC(new Date(date))
        const rows = await db.query.events.findMany({
            where: and(gte(events.startDate, from), lt(events.startDate, to)),
            with: withRelations,
            orderBy: asc(events.startDate),
        })
        return c.json({ data: rows.map((r) => eventToDto(r, dateFormat)) })
    })
    .get('/upcoming', zValidator('query', LimitSchema), async (c) => {
        const { limit, dateFormat } = c.req.valid('query')
        const rows = await db.query.events.findMany({
            where: gte(events.startDate, new Date()),
            with: withRelations,
            orderBy: asc(events.startDate),
            limit,
        })
        return c.json({ data: rows.map((r) => eventToDto(r, dateFormat)) })
    })
    .get('/', zValidator('query', FilteredEventsSchema), async (c) => {
        const { from, to, teacherId, roomId, groupId, dateFormat } = c.req.valid('query')
        const conditions = [gte(events.startDate, from), lt(events.startDate, to)]
        if (teacherId) {
            conditions.push(
                inArray(
                    events.id,
                    db
                        .select({ id: eventTeachers.eventId })
                        .from(eventTeachers)
                        .where(eq(eventTeachers.teacherId, teacherId)),
                ),
            )
        }
        if (roomId) {
            conditions.push(
                inArray(
                    events.id,
                    db
                        .select({ id: eventLocations.eventId })
                        .from(eventLocations)
                        .where(eq(eventLocations.locationId, roomId)),
                ),
            )
        }
        if (groupId) {
            conditions.push(
                inArray(
                    events.id,
                    db
                        .select({ id: eventStudentGroups.eventId })
                        .from(eventStudentGroups)
                        .where(eq(eventStudentGroups.studentGroupId, groupId)),
                ),
            )
        }
        const rows = await db.query.events.findMany({
            where: and(...conditions),
            with: withRelations,
            orderBy: asc(events.startDate),
        })
        return c.json({ data: rows.map((r) => eventToDto(r, dateFormat)) })
    })
    .get('/:id', zValidator('query', z.object({ dateFormat: DateFormatSchema })), async (c) => {
        const id = c.req.param('id')
        const { dateFormat } = c.req.valid('query')
        const row = await db.query.events.findFirst({
            where: eq(events.id, id),
            with: withRelations,
        })
        if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Event not found' } }, 404)
        return c.json(eventToDto(row, dateFormat))
    })
