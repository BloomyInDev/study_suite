import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { events } from '@studysuite/db'
import { eventStudentGroups } from '@studysuite/db'
import { and, asc, eq, gte, inArray, lt } from 'drizzle-orm'
import { wallClockNow } from '@studysuite/shared/time'
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
import {
    EventDtoSchema,
    IdParamSchema,
    dataResponse,
    errorResponse,
    jsonResponse,
} from '../schemas/responses.js'

export default new OpenAPIHono()
    .openapi(
        createRoute({
            method: 'get',
            path: '/titles',
            operationId: 'listEventTitles',
            summary: 'List distinct course titles',
            tags: ['Events'],
            responses: {
                200: dataResponse(z.array(z.string()), 'Distinct event titles'),
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
            summary: 'List a week of events',
            description: 'Returns the Monday-to-Sunday week containing `date`.',
            tags: ['Events'],
            request: { query: DateParamSchema },
            responses: {
                200: dataResponse(z.array(EventDtoSchema), 'Events for the week'),
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
            summary: 'List a day of events',
            tags: ['Events'],
            request: { query: DateParamSchema },
            responses: {
                200: dataResponse(z.array(EventDtoSchema), 'Events for the day'),
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
            summary: 'List the next events',
            description:
                'Filtering by `groupIds` happens in SQL, before the limit, so the caller gets `limit` events for those groups rather than the next `limit` events overall.',
            tags: ['Events'],
            request: { query: LimitSchema },
            responses: {
                200: dataResponse(z.array(EventDtoSchema), 'Upcoming events'),
            },
        }),
        async (c) => {
            const { limit, dateFormat, groupIds } = c.req.valid('query')
            const rows = await db.query.events.findMany({
                where: and(
                    // On `endDate`, not `startDate`: the homepage asks this route for
                    // "what is on now, or next", and a class already under way is
                    // the honest answer to that.
                    gte(events.endDate, wallClockNow()),
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
            summary: 'Search events',
            description: 'All filters are optional and combine with AND.',
            tags: ['Events'],
            request: { query: FilteredEventsSchema },
            responses: {
                200: dataResponse(z.array(EventDtoSchema), 'Filtered events'),
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
            summary: 'Get one event',
            tags: ['Events'],
            request: {
                params: IdParamSchema,
                query: z.object({ dateFormat: DateFormatSchema }),
            },
            responses: {
                200: jsonResponse(EventDtoSchema, 'Event detail'),
                404: errorResponse('Not found'),
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
