import { z } from '@hono/zod-openapi'

export const DateFormatSchema = z.enum(['iso', 'unix', 'unix-ms']).default('iso')
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
