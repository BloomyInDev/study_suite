import { z } from '@hono/zod-openapi'
import { parseInstant } from '@studysuite/shared/time'

/**
 * How event timestamps are rendered on the wire. `unix-instant` and
 * `unix-ms-instant` are aliases of `unix` and `unix-ms`, kept for the clients
 * that already send them.
 */
export const DateFormatSchema = z
    .enum(['iso', 'iso-offset', 'unix', 'unix-ms', 'unix-instant', 'unix-ms-instant'])
    .default('iso')
    .openapi({
        param: { name: 'dateFormat', in: 'query' },
        description:
            'How `startDate` / `endDate` are written. `iso` is UTC (`2026-09-01T06:30:00.000Z`), `iso-offset` carries the Paris offset (`2026-09-01T08:30:00.000+02:00`), `unix` is epoch seconds and `unix-ms` epoch milliseconds. `unix-instant` and `unix-ms-instant` are aliases of the last two.',
        example: 'iso',
    })
export type DateFormat = z.infer<typeof DateFormatSchema>

/**
 * Not `z.coerce.date()`: `new Date()` reads a string without an offset in the
 * process timezone and a bare date as UTC midnight, where a Paris day is meant.
 */
const instantParam = (name: string, what: string) =>
    z
        .string()
        .transform((v, ctx) => {
            const d = /^\d+$/.test(v) ? new Date(Number(v)) : parseInstant(v)
            if (!d || Number.isNaN(d.getTime())) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: 'Expected an ISO 8601 timestamp or epoch milliseconds',
                })
                return z.NEVER
            }
            return d
        })
        .openapi({
            param: { name, in: 'query' },
            description: `${what} ISO 8601, or epoch milliseconds. A value naming no offset (\`2026-09-07\`, \`2026-09-07T08:00\`) is read in Europe/Paris.`,
            example: '2026-09-07T08:00:00.000+02:00',
        })

const fromParam = () => instantParam('from', 'Only events starting at or after this.')
const toParam = () => instantParam('to', 'Only events starting before this.')

/**
 * Course titles to leave out, matched exactly. Repeated rather than
 * comma-separated because a title may itself hold a comma:
 * `?excludeTitle=Anglais&excludeTitle=PPP`. A lone value arrives as a string,
 * several as an array, and both come out as an array.
 */
export const ExcludeTitleSchema = z
    .union([z.string().max(200), z.array(z.string().max(200)).max(100)])
    .optional()
    .transform((v) => (v === undefined ? undefined : [v].flat().filter(Boolean)))
    .openapi({
        param: { name: 'excludeTitle', in: 'query' },
        description:
            'A course title to hide, matched exactly. Repeat the parameter to hide several.',
        example: 'Anglais',
    })

/**
 * Whether a group filter also covers the group's ancestors. On by default: a
 * course is tagged with the widest group it is for, so a promo-wide lecture
 * carries the promo and a filter on one TD group alone would miss it. `false`
 * keeps the filter to exactly the groups asked for.
 *
 * An enum of spellings rather than `z.coerce.boolean()`, which reads the
 * string `"false"` as true.
 */
export const IncludeAncestorGroupsSchema = z
    .enum(['true', 'false', '1', '0'])
    .default('true')
    .transform((v) => v === 'true' || v === '1')
    .openapi({
        param: { name: 'includeAncestorGroups', in: 'query' },
        description:
            "Also match the ancestors of the group(s) filtered on, which is what a student's own timetable is: their group plus the semester and promo above it. Pass `false` for the exact groups only. Ignored without a group filter.",
        example: 'true',
    })

export const DateParamSchema = z.object({
    date: z
        .string()
        .date()
        .openapi({
            param: { name: 'date', in: 'query' },
            description: 'A calendar day in Europe/Paris, `YYYY-MM-DD`.',
            example: '2026-09-07',
        }),
    excludeTitle: ExcludeTitleSchema,
    dateFormat: DateFormatSchema,
})

export const DateRangeSchema = z.object({
    from: instantParam('from', 'Start of the range.'),
    to: instantParam('to', 'End of the range.'),
    dateFormat: DateFormatSchema,
})

export const FilteredEventsSchema = z.object({
    from: fromParam(),
    to: toParam(),
    teacherId: z.string().uuid().optional(),
    roomId: z.string().uuid().optional(),
    groupId: z.string().uuid().optional(),
    includeAncestorGroups: IncludeAncestorGroupsSchema,
    excludeTitle: ExcludeTitleSchema,
    dateFormat: DateFormatSchema,
})

export const LimitSchema = z.object({
    limit: z.coerce.number().int().positive().max(100).default(10),
    /** Comma-separated group ids; the limit then applies to those groups only. */
    groupIds: z
        .string()
        .optional()
        .transform((v) => (v ? v.split(',').filter(Boolean) : undefined))
        .openapi({ param: { name: 'groupIds', in: 'query' } }),
    includeAncestorGroups: IncludeAncestorGroupsSchema,
    /** Applied before the limit, like `groupIds`, so hidden courses do not use it up. */
    excludeTitle: ExcludeTitleSchema,
    dateFormat: DateFormatSchema,
})

export const OptionalDateRangeSchema = z.object({
    from: fromParam().optional(),
    to: toParam().optional(),
    dateFormat: DateFormatSchema,
})

/** The date window of `GET /groups/:id/events`, where the group is the path's. */
export const GroupEventsQuerySchema = OptionalDateRangeSchema.extend({
    includeAncestorGroups: IncludeAncestorGroupsSchema,
})

export const SearchSchema = z.object({
    q: z.string().min(1),
    dateFormat: DateFormatSchema,
})

export const calendarFromParam = () => fromParam().optional()
export const calendarToParam = () => toParam().optional()

export const EventChangesSchema = z.object({
    /** Comma-separated group ids; only changes touching those groups come back. */
    groupIds: z
        .string()
        .optional()
        .transform((v) => (v ? v.split(',').filter(Boolean) : undefined))
        .openapi({ param: { name: 'groupIds', in: 'query' } }),
    includeAncestorGroups: IncludeAncestorGroupsSchema,
    /** How far back to look, in days, on the detection date. */
    days: z.coerce.number().int().positive().max(90).default(14),
    /**
     * A cursor for pollers: only changes detected strictly after this instant,
     * oldest first. Pass back the last `detectedAt` you processed.
     */
    since: z.coerce.date().optional().openapi({
        description:
            'Polling cursor: only changes detected strictly after this instant (a real instant, e.g. the last `detectedAt` you saw), returned **oldest first**. Replaces `days`. One scraper run shares a single `detectedAt`, so a run larger than `limit` is cut short. Keep `groupIds` narrow.',
        example: '2026-09-11T07:30:00.000Z',
    }),
    limit: z.coerce.number().int().positive().max(200).default(100),
    dateFormat: DateFormatSchema,
})
