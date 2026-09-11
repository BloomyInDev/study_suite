import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { assignments, discordGuilds, discordRoleMappings, studentGroups } from '@studysuite/db'
import { asc, eq } from 'drizzle-orm'
import { db } from '../db.js'
import { requireBot } from '../middleware/auth.js'
import { AssignmentDtoSchema, dataResponse, errorResponse } from '../schemas/responses.js'
import { assignmentToDto, getAncestorGroupIds, withRelations } from './assignments.js'

/**
 * What the Discord bot reads as itself, acting for no member: the routes that
 * serve a whole channel. Anything done *for* a member goes through the normal
 * routes with `X-Acting-Discord-User` instead (see `requireAuth`).
 */

const GuildParamSchema = z.object({
    discordGuildId: z
        .string()
        .regex(/^\d{17,20}$/)
        .openapi({ param: { name: 'discordGuildId', in: 'path' }, example: '705623509884796939' }),
})

const BotRoleMappingSchema = z
    .object({
        discordRoleId: z.string().openapi({ example: '812340987654321098' }),
        userRole: z.enum(['student', 'teacher']),
        studentGroup: z
            .object({
                id: z.string().uuid(),
                internalName: z.string().openapi({ example: 'BUT3-A' }),
                displayName: z.string().nullable(),
            })
            .nullable(),
    })
    .openapi('BotRoleMapping')

const BotAssignmentsQuerySchema = z.object({
    groupIds: z
        .string()
        .transform((s) => s.split(',').filter(Boolean))
        .pipe(z.array(z.string().uuid()).min(1))
        .openapi({
            param: { name: 'groupIds', in: 'query' },
            description:
                'Comma-separated group ids. Homework set on a parent group (the whole year) comes back for its children too, as it does for a student.',
        }),
    from: z.coerce.date().optional().openapi({ description: 'Due on or after (a real instant)' }),
    to: z.coerce.date().optional().openapi({ description: 'Due on or before (a real instant)' }),
})

const app = new OpenAPIHono()
app.use(requireBot)

app.openapi(
    createRoute({
        method: 'get',
        path: '/guilds/{discordGuildId}/mappings',
        operationId: 'botListRoleMappings',
        summary: 'Discord role → student group mappings of one server',
        description:
            'Lets the bot work out a member’s class from their roles, from the same table that auto-approves them at sign-in. An unconfigured server answers an empty list.',
        tags: ['Bot'],
        security: [{ Bot: [] }],
        request: { params: GuildParamSchema },
        responses: {
            200: dataResponse(z.array(BotRoleMappingSchema), 'Role mappings'),
            401: errorResponse('Unauthorized'),
            503: errorResponse('Bot access is not configured'),
        },
    }),
    async (c) => {
        const { discordGuildId } = c.req.valid('param')
        const rows = await db
            .select({
                discordRoleId: discordRoleMappings.discordRoleId,
                userRole: discordRoleMappings.userRole,
                groupId: studentGroups.id,
                internalName: studentGroups.internalName,
                displayName: studentGroups.displayName,
            })
            .from(discordRoleMappings)
            .innerJoin(discordGuilds, eq(discordGuilds.id, discordRoleMappings.guildId))
            .leftJoin(studentGroups, eq(studentGroups.id, discordRoleMappings.studentGroupId))
            .where(eq(discordGuilds.discordGuildId, discordGuildId))

        return c.json(
            {
                data: rows.map((r) => ({
                    discordRoleId: r.discordRoleId,
                    userRole: r.userRole,
                    studentGroup: r.groupId
                        ? {
                              id: r.groupId,
                              internalName: r.internalName!,
                              displayName: r.displayName,
                          }
                        : null,
                })),
            },
            200,
        )
    },
)

app.openapi(
    createRoute({
        method: 'get',
        path: '/assignments',
        operationId: 'botListAssignments',
        summary: 'Homework of some groups, for channel reminders',
        description:
            'Ordered by due date. `completedByMe` is always false: there is no “me”. To read a member’s own list, call `GET /api/assignments` with `X-Acting-Discord-User`.',
        tags: ['Bot'],
        security: [{ Bot: [] }],
        request: { query: BotAssignmentsQuerySchema },
        responses: {
            200: dataResponse(z.array(AssignmentDtoSchema), 'Assignments'),
            401: errorResponse('Unauthorized'),
            503: errorResponse('Bot access is not configured'),
        },
    }),
    async (c) => {
        const { groupIds, from, to } = c.req.valid('query')

        const scope = new Set(groupIds)
        for (const id of groupIds) {
            ;(await getAncestorGroupIds(id)).forEach((a) => scope.add(a))
        }

        const rows = await db.query.assignments.findMany({
            where: (a, { and, inArray, gte, lte }) =>
                and(
                    inArray(a.studentGroupId, [...scope]),
                    from ? gte(a.dueDate, from) : undefined,
                    to ? lte(a.dueDate, to) : undefined,
                ),
            with: withRelations,
            orderBy: asc(assignments.dueDate),
        })

        return c.json({ data: rows.map((r) => assignmentToDto(r, null)) }, 200)
    },
)

export default app
