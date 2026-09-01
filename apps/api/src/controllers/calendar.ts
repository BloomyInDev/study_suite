import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { events, locations, studentGroups, teachers } from '@studysuite/db'
import { and, asc, eq } from 'drizzle-orm'
import { db } from '../db.js'
import { eventFilterConditions } from '../lib/event-filters.js'
import { buildCalendar } from '../lib/ical.js'
import { withEventRelations } from '../lib/serialize.js'

/**
 * How far back the feed reaches when no explicit `from` is given. Calendar
 * clients re-fetch the whole document, so an unbounded history would grow the
 * payload every week for events nobody looks at any more.
 */
const DEFAULT_PAST_DAYS = 60

const CalendarQuerySchema = z.object({
    groupId: z.string().uuid().optional(),
    teacherId: z.string().uuid().optional(),
    roomId: z.string().uuid().optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
})

/** Name shown by the calendar client, derived from whatever the feed filters on. */
async function calendarName(filters: z.infer<typeof CalendarQuerySchema>): Promise<string> {
    if (filters.groupId) {
        const [group] = await db
            .select()
            .from(studentGroups)
            .where(eq(studentGroups.id, filters.groupId))
        if (group) return `Planning ${group.displayName ?? group.internalName}`
    }
    if (filters.teacherId) {
        const [teacher] = await db.select().from(teachers).where(eq(teachers.id, filters.teacherId))
        if (teacher) return `Planning ${teacher.firstName} ${teacher.lastName}`
    }
    if (filters.roomId) {
        const [room] = await db.select().from(locations).where(eq(locations.id, filters.roomId))
        if (room) return `Planning ${room.name}`
    }
    return 'Planning'
}

export default new OpenAPIHono().openapi(
    createRoute({
        method: 'get',
        path: '/',
        operationId: 'getCalendar',
        summary: 'Subscribe to the planning as iCal',
        tags: ['Events'],
        description:
            'iCalendar feed of the events matching the filters, meant to be subscribed to from a calendar client.',
        request: { query: CalendarQuerySchema },
        responses: {
            200: {
                content: {
                    'text/calendar': {
                        schema: z.string().openapi({
                            example:
                                'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//StudySuite//Planning//FR\r\n…\r\nEND:VCALENDAR',
                        }),
                    },
                },
                description: 'iCalendar document, served as an attachment-less text/calendar body',
            },
        },
    }),
    async (c) => {
        const filters = c.req.valid('query')
        const from =
            filters.from ?? new Date(Date.now() - DEFAULT_PAST_DAYS * 24 * 60 * 60 * 1000)
        const rows = await db.query.events.findMany({
            where: and(...eventFilterConditions({ ...filters, from })),
            with: withEventRelations,
            orderBy: asc(events.startDate),
        })

        const ics = buildCalendar(
            rows.map((row) => ({
                id: row.id,
                title: row.title,
                startDate: row.startDate,
                endDate: row.endDate,
                updatedAt: row.updatedAt,
                rooms: row.eventLocations.map((el) => el.location),
                teachers: row.eventTeachers.map((et) => et.teacher),
                groups: row.eventStudentGroups.map((eg) => eg.studentGroup),
            })),
            { name: await calendarName(filters), domain: new URL(c.req.url).host },
        )

        return c.body(ics, 200, {
            'Content-Type': 'text/calendar; charset=utf-8',
            'Content-Disposition': 'inline; filename="planning.ics"',
            // Clients poll this often; a short cache spares the database without
            // making a fresh scrape wait long to show up.
            'Cache-Control': 'public, max-age=900',
        })
    },
)
