import { z } from '@hono/zod-openapi'

/**
 * How event timestamps are rendered on the wire.
 *
 * `iso`, `unix` and `unix-ms` all carry the Paris *wall-clock label* the
 * planning is stored as, so `iso` ends in `Z` while denoting local time and the
 * two numeric formats are the same label as an epoch, off by the Paris offset,
 * with nothing in the value to signal it. They stay, `iso` as the default,
 * because clients already depend on them.
 *
 * `iso-offset`, `unix-instant` and `unix-ms-instant` are the honest three: the
 * real instant the label denotes, with `+01:00` / `+02:00` resolved per
 * timestamp. Prefer them in any new client.
 */
export const DateFormatSchema = z
    .enum(['iso', 'iso-offset', 'unix', 'unix-ms', 'unix-instant', 'unix-ms-instant'])
    .default('iso')
export type DateFormat = z.infer<typeof DateFormatSchema>

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
    date: z.string().date(),
    excludeTitle: ExcludeTitleSchema,
    dateFormat: DateFormatSchema,
})

export const DateRangeSchema = z.object({
    from: z.string(),
    to: z.string(),
    dateFormat: DateFormatSchema,
})

export const FilteredEventsSchema = z.object({
    from: z.coerce.date(),
    to: z.coerce.date(),
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

// Accepts ISO date strings, unix timestamps in milliseconds
const TimestampSchema = z.coerce
    .date()
    .or(z.number().int().positive())
    .or(z.string().regex(/^\d+$/).transform(Number))

export const OptionalDateRangeSchema = z.object({
    from: TimestampSchema.optional(),
    to: TimestampSchema.optional(),
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
