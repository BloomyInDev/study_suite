import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { eventLocations, events, locations } from '@studysuite/db'
import { and, asc, eq, gt, inArray, lt, notInArray } from 'drizzle-orm'
import { db } from '../db.js'
import { requireAuth, type AuthEnv } from '../middleware/auth.js'
import { eventToDto, withEventRelations } from '../lib/serialize.js'
import { DateRangeSchema, OptionalDateRangeSchema } from '../schemas/query.js'
import {
    EventDtoSchema,
    IdParamSchema,
    LocationSchema,
    dataResponse,
    errorResponse,
    jsonResponse,
} from '../schemas/responses.js'

// Room directory is not public information.
const app = new OpenAPIHono<AuthEnv>()
app.use(requireAuth)

export default app
    .openapi(
        createRoute({
            method: 'get',
            path: '/available',
            operationId: 'getAvailableRooms',
            summary: 'List rooms free over a time range',
            description:
                'A room counts as busy when any event overlaps the range, not merely starts inside it. ' +
                '`from` and `to` are Paris wall-clock labelled UTC, the same encoding the event ' +
                'timestamps come back in — passing a real instant (`new Date().toISOString()`) ' +
                'shifts the window by the Paris offset.',
            tags: ['Rooms'],
            request: { query: DateRangeSchema },
            responses: {
                200: dataResponse(z.array(LocationSchema), 'Rooms available during the time range'),
            },
        }),
        async (c) => {
            const { from, to } = c.req.valid('query')
            const fromDate = new Date(from)
            const toDate = new Date(to)
            const busyRows = await db
                .selectDistinct({ id: eventLocations.locationId })
                .from(eventLocations)
                .innerJoin(events, eq(eventLocations.eventId, events.id))
                .where(and(lt(events.startDate, toDate), gt(events.endDate, fromDate)))
            const busyIds = busyRows.map((r) => r.id)
            const rows = await db
                .select()
                .from(locations)
                .where(busyIds.length > 0 ? notInArray(locations.id, busyIds) : undefined)
                .orderBy(asc(locations.name))
            return c.json({ data: rows }, 200)
        },
    )
    .openapi(
        createRoute({
            method: 'get',
            path: '/',
            operationId: 'listRooms',
            summary: 'List all rooms',
            tags: ['Rooms'],
            responses: {
                200: dataResponse(z.array(LocationSchema), 'All rooms'),
            },
        }),
        async (c) => {
            const rows = await db.select().from(locations).orderBy(asc(locations.name))
            return c.json({ data: rows }, 200)
        },
    )
    .openapi(
        createRoute({
            method: 'get',
            path: '/{id}',
            operationId: 'getRoom',
            summary: 'Get one room',
            tags: ['Rooms'],
            request: { params: IdParamSchema },
            responses: {
                200: jsonResponse(LocationSchema, 'Room detail'),
                404: errorResponse('Not found'),
            },
        }),
        async (c) => {
            const { id } = c.req.valid('param')
            const [row] = await db.select().from(locations).where(eq(locations.id, id))
            if (!row)
                return c.json({ error: { code: 'NOT_FOUND', message: 'Room not found' } }, 404)
            return c.json(row, 200)
        },
    )
    .openapi(
        createRoute({
            method: 'get',
            path: '/{id}/events',
            operationId: 'listRoomEvents',
            summary: "List a room's events",
            tags: ['Rooms'],
            request: { params: IdParamSchema, query: OptionalDateRangeSchema },
            responses: {
                200: dataResponse(z.array(EventDtoSchema), 'Events for the room'),
                404: errorResponse('Not found'),
            },
        }),
        async (c) => {
            const { id } = c.req.valid('param')
            const { from, to, dateFormat } = c.req.valid('query')
            const fromDate = from ? new Date(from) : undefined
            const toDate = to ? new Date(to) : undefined
            const [room] = await db.select().from(locations).where(eq(locations.id, id))
            if (!room)
                return c.json({ error: { code: 'NOT_FOUND', message: 'Room not found' } }, 404)
            const rows = await db.query.events.findMany({
                where: and(
                    inArray(
                        events.id,
                        db
                            .select({ id: eventLocations.eventId })
                            .from(eventLocations)
                            .where(eq(eventLocations.locationId, id)),
                    ),
                    fromDate ? gt(events.startDate, fromDate) : undefined,
                    toDate ? lt(events.startDate, toDate) : undefined,
                ),
                with: withEventRelations,
                orderBy: asc(events.startDate),
            })
            return c.json({ data: rows.map((r) => eventToDto(r, dateFormat)) }, 200)
        },
    )
