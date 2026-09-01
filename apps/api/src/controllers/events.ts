import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { events } from '@studysuite/db'
import { eventStudentGroups } from '@studysuite/db'
import { and, asc, eq, gte, inArray, lt } from 'drizzle-orm'
import { db } from '../db.js'
import { dayEndUTC, dayStartUTC, weekMondayUTC } from '../lib/date.js'
import { eventFilterConditions } from '../lib/event-filters.js'
import { eventToDto, withEventRelations } from '../lib/serialize.js'
import {
    DateFormatSchema,
    DateParamSchema,
    FilteredEventsSchema,
    LimitSchema,
} from '../schemas/query.js'
import { ErrorSchema, EventDtoSchema, IdParamSchema } from '../schemas/responses.js'

const EventList = z.object({ data: z.array(EventDtoSchema) })

export default new OpenAPIHono()
    .openapi(
        createRoute({
            method: 'get',
            path: '/titles',
            operationId: 'listEventTitles',
            tags: ['Events'],
            responses: {
                200: {
                    content: { 'application/json': { schema: z.object({ data: z.array(z.string()) }) } },
                    description: 'Distinct event titles',
                },
            },
        }),
        async (c) => {
            const rows = await db
                .selectDistinct({ title: events.title })
                .from(events)
                .orderBy(asc(events.title))
            return c.json({ data: rows.map((r) => r.title) }, 200)
        },
    )
    .openapi(
        createRoute({
            method: 'get',
            path: '/week',
            operationId: 'getWeekEvents',
            tags: ['Events'],
            request: { query: DateParamSchema },
            responses: {
                200: { content: { 'application/json': { schema: EventList } }, description: 'Events for the week' },
            },
        }),
        async (c) => {
            const { date, dateFormat } = c.req.valid('query')
            const from = weekMondayUTC(new Date(date))
            const to = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000)
            const rows = await db.query.events.findMany({
                where: and(gte(events.startDate, from), lt(events.startDate, to)),
                with: withEventRelations,
                orderBy: asc(events.startDate),
            })
            return c.json({ data: rows.map((r) => eventToDto(r, dateFormat)) }, 200)
        },
    )
    .openapi(
        createRoute({
            method: 'get',
            path: '/day',
            operationId: 'getDayEvents',
            tags: ['Events'],
            request: { query: DateParamSchema },
            responses: {
                200: { content: { 'application/json': { schema: EventList } }, description: 'Events for the day' },
            },
        }),
        async (c) => {
            const { date, dateFormat } = c.req.valid('query')
            const from = dayStartUTC(new Date(date))
            const to = dayEndUTC(new Date(date))
            const rows = await db.query.events.findMany({
                where: and(gte(events.startDate, from), lt(events.startDate, to)),
                with: withEventRelations,
                orderBy: asc(events.startDate),
            })
            return c.json({ data: rows.map((r) => eventToDto(r, dateFormat)) }, 200)
        },
    )
    .openapi(
        createRoute({
            method: 'get',
            path: '/upcoming',
            operationId: 'getUpcomingEvents',
            tags: ['Events'],
            request: { query: LimitSchema },
            responses: {
                200: { content: { 'application/json': { schema: EventList } }, description: 'Upcoming events' },
            },
        }),
        async (c) => {
            const { limit, dateFormat, groupIds } = c.req.valid('query')
            const rows = await db.query.events.findMany({
                where: and(
                    gte(events.startDate, new Date()),
                    // Filter here, not client-side: limiting first would return
                    // other groups' events and leave the user with an empty list.
                    groupIds && groupIds.length > 0
                        ? inArray(
                              events.id,
                              db
                                  .select({ id: eventStudentGroups.eventId })
                                  .from(eventStudentGroups)
                                  .where(inArray(eventStudentGroups.studentGroupId, groupIds)),
                          )
                        : undefined,
                ),
                with: withEventRelations,
                orderBy: asc(events.startDate),
                limit,
            })
            return c.json({ data: rows.map((r) => eventToDto(r, dateFormat)) }, 200)
        },
    )
    .openapi(
        createRoute({
            method: 'get',
            path: '/',
            operationId: 'listEvents',
            tags: ['Events'],
            request: { query: FilteredEventsSchema },
            responses: {
                200: { content: { 'application/json': { schema: EventList } }, description: 'Filtered events' },
            },
        }),
        async (c) => {
            const { dateFormat, ...filters } = c.req.valid('query')
            const conditions = eventFilterConditions(filters)
            const rows = await db.query.events.findMany({
                where: and(...conditions),
                with: withEventRelations,
                orderBy: asc(events.startDate),
            })
            return c.json({ data: rows.map((r) => eventToDto(r, dateFormat)) }, 200)
        },
    )
    .openapi(
        createRoute({
            method: 'get',
            path: '/{id}',
            operationId: 'getEvent',
            tags: ['Events'],
            request: {
                params: IdParamSchema,
                query: z.object({ dateFormat: DateFormatSchema }),
            },
            responses: {
                200: { content: { 'application/json': { schema: EventDtoSchema } }, description: 'Event detail' },
                404: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Not found' },
            },
        }),
        async (c) => {
            const { id } = c.req.valid('param')
            const { dateFormat } = c.req.valid('query')
            const row = await db.query.events.findFirst({
                where: eq(events.id, id),
                with: withEventRelations,
            })
            if (!row)
                return c.json({ error: { code: 'NOT_FOUND', message: 'Event not found' } }, 404)
            return c.json(eventToDto(row, dateFormat), 200)
        },
    )
