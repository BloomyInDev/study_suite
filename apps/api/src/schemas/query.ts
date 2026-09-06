import { z } from '@hono/zod-openapi'

/**
 * How event timestamps are rendered on the wire.
 *
 * `iso`, `unix` and `unix-ms` all carry the Paris *wall-clock label* the
 * planning is stored as, so `iso` ends in `Z` while denoting local time and the
 * two numeric formats are the same label as an epoch — off by the Paris offset,
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

export const DateParamSchema = z.object({
    date: z.string().date(),
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
    /** How far back to look, in days, on the detection date. */
    days: z.coerce.number().int().positive().max(90).default(14),
    limit: z.coerce.number().int().positive().max(200).default(100),
    dateFormat: DateFormatSchema,
})
