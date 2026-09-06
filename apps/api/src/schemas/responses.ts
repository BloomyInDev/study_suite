import { z } from '@hono/zod-openapi'

export const ErrorSchema = z
    .object({
        error: z.object({
            code: z.string().openapi({ example: 'NOT_FOUND' }),
            message: z.string().openapi({ example: 'Resource not found' }),
        }),
    })
    .openapi('Error')

const uuid = (example: string) => z.string().uuid().openapi({ example })

export const IdParamSchema = z.object({
    id: uuid('9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d').openapi({ param: { name: 'id', in: 'path' } }),
})

// --- Response builders -------------------------------------------------------
// Every JSON payload travels in a `{ data }` envelope, and every failure is an
// `Error`. Spelling that out at each of the ~45 routes buried the one part that
// differs — the schema and the description.

/** A `{ data: <schema> }` body, the shape every successful response uses. */
export function dataResponse<T extends z.ZodTypeAny>(schema: T, description: string) {
    return {
        content: { 'application/json': { schema: z.object({ data: schema }) } },
        description,
    }
}

/** A body that is not enveloped — a handful of routes answer with the entity itself. */
export function jsonResponse<T extends z.ZodTypeAny>(schema: T, description: string) {
    return { content: { 'application/json': { schema } }, description }
}

/** A failure body; all of them share the `Error` component. */
export function errorResponse(description: string) {
    return jsonResponse(ErrorSchema, description)
}

// --- Entities ----------------------------------------------------------------

export const LocationSchema = z
    .object({
        id: uuid('6f5d2c1a-9e7b-4c3d-8a1f-0b2e4d6c8a90'),
        name: z.string().openapi({ example: 'Salle 007' }),
    })
    .openapi('Location')

export const TeacherRefSchema = z
    .object({
        id: uuid('1c9e3f8a-2b4d-4e6f-9a1b-3c5d7e9f1a2b'),
        firstName: z.string().openapi({ example: 'Jean' }),
        lastName: z.string().openapi({ example: 'DUPONT' }),
    })
    .openapi('TeacherRef')

export const GroupRefSchema = z
    .object({
        id: uuid('4d8b6a2c-7e1f-4a3b-9c5d-8e0f2a4b6c8d'),
        internalName: z.string().openapi({ example: 'BUT3-A' }),
        displayName: z.string().nullable().openapi({ example: 'BUT 3 — Groupe A' }),
    })
    .openapi('GroupRef')

export const EventDtoSchema = z
    .object({
        id: uuid('2a7c9e1b-5d3f-4a8b-9c2e-6f0a1b3c5d7e'),
        title: z.string().openapi({ example: 'R5.05 — Programmation système' }),
        startDate: z.union([z.string(), z.number()]).openapi({
            description: 'ISO date string or unix timestamp (seconds/ms) based on the dateFormat param',
            example: '2026-09-01T08:30:00.000Z',
        }),
        endDate: z.union([z.string(), z.number()]).openapi({
            description: 'ISO date string or unix timestamp (seconds/ms) based on the dateFormat param',
            example: '2026-09-01T10:30:00.000Z',
        }),
        source: z.string().openapi({ example: 'prose' }),
        rooms: z.array(LocationSchema),
        teachers: z.array(TeacherRefSchema),
        groups: z.array(GroupRefSchema),
    })
    .openapi('Event')

export const TeacherSchema = z
    .object({
        id: uuid('1c9e3f8a-2b4d-4e6f-9a1b-3c5d7e9f1a2b'),
        firstName: z.string().openapi({ example: 'Jean' }),
        lastName: z.string().openapi({ example: 'DUPONT' }),
        available: z.boolean().openapi({
            description: 'False while the teacher is in a course right now',
            example: true,
        }),
    })
    .openapi('Teacher')

export const TeacherDetailSchema = z
    .object({
        id: uuid('1c9e3f8a-2b4d-4e6f-9a1b-3c5d7e9f1a2b'),
        firstName: z.string().openapi({ example: 'Jean' }),
        lastName: z.string().openapi({ example: 'DUPONT' }),
        available: z.boolean().openapi({ example: false }),
        currentEvent: EventDtoSchema.nullable().openapi({
            description: 'The course running right now, or null when the teacher is free',
        }),
    })
    .openapi('TeacherDetail')

export const GroupSchema = z
    .object({
        id: uuid('4d8b6a2c-7e1f-4a3b-9c5d-8e0f2a4b6c8d'),
        internalName: z.string().openapi({ example: 'BUT3-A' }),
        displayName: z.string().nullable().openapi({ example: 'BUT 3 — Groupe A' }),
        hidden: z.boolean().openapi({
            description: 'Hidden groups stay out of the pickers offered to students',
            example: false,
        }),
        parents: z.array(GroupRefSchema).openapi({ description: 'Groups this one belongs to' }),
        children: z.array(GroupRefSchema).openapi({ description: 'Groups that belong to this one' }),
    })
    .openapi('Group')

export const AssignmentDtoSchema = z
    .object({
        id: uuid('8e2f4a6b-1c3d-4e5f-8a9b-0c1d2e3f4a5b'),
        title: z.string().openapi({ example: 'Rendu TP3' }),
        subject: z.string().nullable().openapi({ example: 'R5.05' }),
        description: z.string().nullable().openapi({ example: 'Archive .tar.gz sur Moodle' }),
        dueDate: z.string().openapi({ example: '2026-09-15T23:59:00.000Z' }),
        studentGroup: GroupRefSchema,
        event: z
            .object({
                id: uuid('2a7c9e1b-5d3f-4a8b-9c2e-6f0a1b3c5d7e'),
                title: z.string().openapi({ example: 'R5.05 — Programmation système' }),
            })
            .nullable()
            .openapi({ description: 'The course this assignment was set in, when it is known' }),
        createdBy: z
            .object({
                id: uuid('7b3d5f1a-9c2e-4b6d-8f0a-1c3e5a7b9d1f'),
                discordUsername: z.string().openapi({ example: 'bastien' }),
            })
            .nullable(),
        updatedBy: z
            .object({
                id: uuid('7b3d5f1a-9c2e-4b6d-8f0a-1c3e5a7b9d1f'),
                discordUsername: z.string().openapi({ example: 'bastien' }),
            })
            .nullable(),
        completedByMe: z.boolean().openapi({ example: false }),
        completionCount: z.number().openapi({
            description: 'How many students in the group have marked it done',
            example: 12,
        }),
        createdAt: z.string().openapi({ example: '2026-09-01T09:12:04.000Z' }),
        updatedAt: z.string().openapi({ example: '2026-09-01T09:12:04.000Z' }),
    })
    .openapi('Assignment')

export const UserDtoSchema = z
    .object({
        id: uuid('7b3d5f1a-9c2e-4b6d-8f0a-1c3e5a7b9d1f'),
        discordId: z.string().openapi({ example: '204255221017214977' }),
        discordUsername: z.string().openapi({ example: 'bastien' }),
        discordAvatar: z.string().nullable().openapi({ example: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6' }),
        role: z.enum(['student', 'teacher']).nullable().openapi({ example: 'student' }),
        isAdmin: z.boolean().openapi({ example: false }),
        status: z.enum(['pending', 'approved', 'rejected']).openapi({
            description: 'A user stays pending until a Discord role matches, or an admin approves them',
            example: 'approved',
        }),
        studentGroupId: uuid('4d8b6a2c-7e1f-4a3b-9c5d-8e0f2a4b6c8d').nullable(),
        assignedGroupId: uuid('4d8b6a2c-7e1f-4a3b-9c5d-8e0f2a4b6c8d').nullable().openapi({
            description: 'Group the user picked themselves; overrides the Discord-derived one',
        }),
        teacherId: uuid('1c9e3f8a-2b4d-4e6f-9a1b-3c5d7e9f1a2b').nullable(),
    })
    .openapi('User')

export const EventChangeDtoSchema = z
    .object({
        id: uuid('8e2f4a6b-1c3d-4e5f-8a9b-0c1d2e3f4a5b'),
        changeType: z.enum(['added', 'removed', 'updated', 'moved']),
        title: z.string().openapi({ example: 'R5.05 — Programmation système' }),
        startDate: z.union([z.string(), z.number()]).openapi({
            description:
                'The slot the event held when it was last seen — for a `moved` change, the old one',
        }),
        endDate: z.union([z.string(), z.number()]),
        /** Present on `moved` only: where the event went. */
        newStartDate: z.union([z.string(), z.number()]).nullable(),
        newEndDate: z.union([z.string(), z.number()]).nullable(),
        groups: z.array(z.string()).openapi({ example: ['BUT3-A'] }),
        /** Present on `updated` only: the rooms, teachers and groups before and after. */
        diff: z
            .object({
                before: z.object({
                    rooms: z.array(z.string()),
                    teachers: z.array(z.object({ firstName: z.string(), lastName: z.string() })),
                    groups: z.array(z.string()),
                }),
                after: z.object({
                    rooms: z.array(z.string()),
                    teachers: z.array(z.object({ firstName: z.string(), lastName: z.string() })),
                    groups: z.array(z.string()),
                }),
            })
            .nullable(),
        detectedAt: z.string().openapi({ example: '2026-09-05T18:02:11.000Z' }),
    })
    .openapi('EventChangeDto')
