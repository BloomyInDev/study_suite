import { z } from '@hono/zod-openapi'

export const ErrorSchema = z
    .object({
        error: z.object({
            code: z.string().openapi({ example: 'NOT_FOUND' }),
            message: z.string().openapi({ example: 'Resource not found' }),
        }),
    })
    .openapi('Error')

export const IdParamSchema = z.object({
    id: z.string().uuid().openapi({ param: { name: 'id', in: 'path' } }),
})

export const LocationSchema = z
    .object({ id: z.string().uuid(), name: z.string() })
    .openapi('Location')

export const TeacherRefSchema = z
    .object({ id: z.string().uuid(), firstName: z.string(), lastName: z.string() })
    .openapi('TeacherRef')

export const GroupRefSchema = z
    .object({ id: z.string().uuid(), internalName: z.string(), displayName: z.string().nullable() })
    .openapi('GroupRef')

export const EventDtoSchema = z
    .object({
        id: z.string().uuid(),
        title: z.string(),
        startDate: z.union([z.string(), z.number()]).openapi({
            description: 'ISO date string or unix timestamp (seconds/ms) based on the dateFormat param',
        }),
        endDate: z.union([z.string(), z.number()]).openapi({
            description: 'ISO date string or unix timestamp (seconds/ms) based on the dateFormat param',
        }),
        source: z.string(),
        rooms: z.array(LocationSchema),
        teachers: z.array(TeacherRefSchema),
        groups: z.array(GroupRefSchema),
    })
    .openapi('Event')

export const TeacherSchema = z
    .object({
        id: z.string().uuid(),
        firstName: z.string(),
        lastName: z.string(),
        available: z.boolean(),
    })
    .openapi('Teacher')

export const TeacherDetailSchema = z
    .object({
        id: z.string().uuid(),
        firstName: z.string(),
        lastName: z.string(),
        available: z.boolean(),
        currentEvent: EventDtoSchema.nullable(),
    })
    .openapi('TeacherDetail')

export const GroupSchema = z
    .object({
        id: z.string().uuid(),
        internalName: z.string(),
        displayName: z.string().nullable(),
        hidden: z.boolean(),
        parents: z.array(GroupRefSchema),
        children: z.array(GroupRefSchema),
    })
    .openapi('Group')

export const AssignmentDtoSchema = z
    .object({
        id: z.string().uuid(),
        title: z.string(),
        subject: z.string().nullable(),
        description: z.string().nullable(),
        dueDate: z.string(),
        studentGroup: GroupRefSchema,
        event: z.object({ id: z.string().uuid(), title: z.string() }).nullable(),
        createdBy: z.object({ id: z.string().uuid(), discordUsername: z.string() }).nullable(),
        updatedBy: z.object({ id: z.string().uuid(), discordUsername: z.string() }).nullable(),
        completedByMe: z.boolean(),
        completionCount: z.number(),
        createdAt: z.string(),
        updatedAt: z.string(),
    })
    .openapi('Assignment')

export const UserDtoSchema = z
    .object({
        id: z.string().uuid(),
        discordId: z.string(),
        discordUsername: z.string(),
        discordAvatar: z.string().nullable(),
        role: z.enum(['student', 'teacher']).nullable(),
        isAdmin: z.boolean(),
        status: z.enum(['pending', 'approved', 'rejected']),
        studentGroupId: z.string().uuid().nullable(),
        teacherId: z.string().uuid().nullable(),
    })
    .openapi('User')
