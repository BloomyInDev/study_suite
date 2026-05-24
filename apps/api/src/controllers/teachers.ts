import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { eventTeachers, events, teachers } from '@studysuite/db'
import { and, asc, eq, gte, ilike, inArray, lt, lte, or } from 'drizzle-orm'
import { db } from '../db.js'
import { dateToUTC } from '../lib/date.js'
import { eventToDto, withEventRelations } from '../lib/serialize.js'
import { DateFormatSchema, OptionalDateRangeSchema, SearchSchema } from '../schemas/query.js'
import {
    ErrorSchema,
    EventDtoSchema,
    IdParamSchema,
    TeacherDetailSchema,
    TeacherSchema,
} from '../schemas/responses.js'

async function busyTeacherIds(at: Date): Promise<Set<string>> {
    const rows = await db
        .selectDistinct({ teacherId: eventTeachers.teacherId })
        .from(eventTeachers)
        .innerJoin(events, eq(eventTeachers.eventId, events.id))
        .where(and(lte(events.startDate, at), gte(events.endDate, at)))
    return new Set(rows.map((r) => r.teacherId))
}

export default new OpenAPIHono()
    .openapi(
        createRoute({
            method: 'get',
            path: '/search',
            operationId: 'searchTeachers',
            tags: ['Teachers'],
            request: { query: SearchSchema },
            responses: {
                200: {
                    content: { 'application/json': { schema: z.object({ data: z.array(TeacherSchema) }) } },
                    description: 'Search results',
                },
            },
        }),
        async (c) => {
            const { q } = c.req.valid('query')
            const rows = await db
                .select()
                .from(teachers)
                .where(or(ilike(teachers.firstName, `%${q}%`), ilike(teachers.lastName, `%${q}%`)))
                .orderBy(asc(teachers.lastName), asc(teachers.firstName))
            return c.json({ data: rows.map((t) => ({ ...t, available: false })) }, 200)
        },
    )
    .openapi(
        createRoute({
            method: 'get',
            path: '/',
            operationId: 'listTeachers',
            tags: ['Teachers'],
            responses: {
                200: {
                    content: { 'application/json': { schema: z.object({ data: z.array(TeacherSchema) }) } },
                    description: 'All teachers with availability',
                },
            },
        }),
        async (c) => {
            const now = dateToUTC(new Date())
            const [rows, busy] = await Promise.all([
                db.select().from(teachers).orderBy(asc(teachers.lastName), asc(teachers.firstName)),
                busyTeacherIds(now),
            ])
            return c.json({ data: rows.map((t) => ({ ...t, available: !busy.has(t.id) })) }, 200)
        },
    )
    .openapi(
        createRoute({
            method: 'get',
            path: '/{id}',
            operationId: 'getTeacher',
            tags: ['Teachers'],
            request: {
                params: IdParamSchema,
                query: z.object({ dateFormat: DateFormatSchema }),
            },
            responses: {
                200: {
                    content: { 'application/json': { schema: z.object({ data: TeacherDetailSchema }) } },
                    description: 'Teacher detail with current event',
                },
                404: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Not found' },
            },
        }),
        async (c) => {
            const { id } = c.req.valid('param')
            const { dateFormat } = c.req.valid('query')
            const [row] = await db.select().from(teachers).where(eq(teachers.id, id))
            if (!row)
                return c.json({ error: { code: 'NOT_FOUND', message: 'Teacher not found' } }, 404)
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
                with: withEventRelations,
            })
            const currentEvent = currentEvents[0] ? eventToDto(currentEvents[0], dateFormat) : null
            return c.json({ data: { ...row, available: currentEvent === null, currentEvent } }, 200)
        },
    )
    .openapi(
        createRoute({
            method: 'get',
            path: '/{id}/events',
            operationId: 'listTeacherEvents',
            tags: ['Teachers'],
            request: { params: IdParamSchema, query: OptionalDateRangeSchema },
            responses: {
                200: {
                    content: { 'application/json': { schema: z.object({ data: z.array(EventDtoSchema) }) } },
                    description: 'Events for the teacher',
                },
                404: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Not found' },
            },
        }),
        async (c) => {
            const { id } = c.req.valid('param')
            const { from, to, dateFormat } = c.req.valid('query')
            const fromDate = from ? new Date(from) : undefined
            const toDate = to ? new Date(to) : undefined
            const [teacher] = await db.select().from(teachers).where(eq(teachers.id, id))
            if (!teacher)
                return c.json({ error: { code: 'NOT_FOUND', message: 'Teacher not found' } }, 404)
            const conditions = [
                inArray(
                    events.id,
                    db
                        .select({ id: eventTeachers.eventId })
                        .from(eventTeachers)
                        .where(eq(eventTeachers.teacherId, id)),
                ),
            ]
            if (fromDate) conditions.push(gte(events.startDate, fromDate))
            if (toDate) conditions.push(lt(events.startDate, toDate))
            const rows = await db.query.events.findMany({
                where: and(...conditions),
                with: withEventRelations,
                orderBy: asc(events.startDate),
            })
            return c.json({ data: rows.map((r) => eventToDto(r, dateFormat)) }, 200)
        },
    )
