import { z } from 'zod'

export const LocationSchema = z.object({
    name: z.string(),
})

export const TeacherSchema = z.object({
    firstName: z.string(),
    lastName: z.string(),
})

export const StudentGroupSchema = z.object({
    internalName: z.string(),
})

export const ParsedEventSchema = z.object({
    title: z.string(),
    startDate: z.date(),
    endDate: z.date(),
    rooms: z.array(LocationSchema),
    teachers: z.array(TeacherSchema),
    groups: z.array(StudentGroupSchema),
    /**
     * The `#rrggbb` the planning paints the event with: its category, the one
     * piece of the page the parser cannot read out of the text. Nullish: an
     * unpainted event has none, and a caller that does not scrape has nothing
     * to supply.
     */
    color: z.string().nullish(),
})

export type Location = z.infer<typeof LocationSchema>
export type Teacher = z.infer<typeof TeacherSchema>
export type StudentGroup = z.infer<typeof StudentGroupSchema>
export type ParsedEvent = z.infer<typeof ParsedEventSchema>
