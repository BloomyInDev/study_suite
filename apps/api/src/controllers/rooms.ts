import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { eventLocations, events, locations } from '@studysuite/db'
import { and, asc, eq, gt, inArray, lt, notInArray } from 'drizzle-orm'
import { db } from '../db.js'
import { eventToDto, withEventRelations } from '../lib/serialize.js'
import { DateRangeSchema, OptionalDateRangeSchema } from '../schemas/query.js'
import { ErrorSchema, EventDtoSchema, IdParamSchema, LocationSchema } from '../schemas/responses.js'

export default new OpenAPIHono()
    .openapi(
        createRoute({
            method: 'get',
            path: '/available',
            operationId: 'getAvailableRooms',
            tags: ['Rooms'],
            request: { query: DateRangeSchema },
            responses: {
                200: {
                    content: { 'application/json': { schema: z.object({ data: z.array(LocationSchema) }) } },
                    description: 'Rooms available during the time range',
                },
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
            tags: ['Rooms'],
            responses: {
                200: {
                    content: { 'application/json': { schema: z.object({ data: z.array(LocationSchema) }) } },
                    description: 'All rooms',
                },
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
            tags: ['Rooms'],
            request: { params: IdParamSchema },
            responses: {
                200: { content: { 'application/json': { schema: LocationSchema } }, description: 'Room detail' },
                404: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Not found' },
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
            tags: ['Rooms'],
            request: { params: IdParamSchema, query: OptionalDateRangeSchema },
            responses: {
                200: {
                    content: { 'application/json': { schema: z.object({ data: z.array(EventDtoSchema) }) } },
                    description: 'Events for the room',
                },
                404: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Not found' },
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
