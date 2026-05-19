import { z } from 'zod'

export const DateFormatSchema = z.enum(['iso', 'unix', 'unix-ms']).default('iso')
export type DateFormat = z.infer<typeof DateFormatSchema>

export const DateParamSchema = z.object({
  date: z.string().date(),
  dateFormat: DateFormatSchema,
})

export const DateRangeSchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
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
  dateFormat: DateFormatSchema,
})

export const OptionalDateRangeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  dateFormat: DateFormatSchema,
})

export const SearchSchema = z.object({
  q: z.string().min(1),
  dateFormat: DateFormatSchema,
})
