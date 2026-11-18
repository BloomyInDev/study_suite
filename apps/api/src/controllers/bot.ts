import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import {
    assignments,
    discordGuilds,
    discordReminders,
    discordRoleMappings,
    studentGroups,
    userIdentities,
} from '@studysuite/db'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { streamSSE } from 'hono/streaming'
import { db } from '../db.js'
import { attachBot } from '../lib/discord-reminder-hub.js'
import { expandGroupIds } from '../lib/group-ancestors.js'
import { requireBot } from '../middleware/auth.js'
import { IncludeAncestorGroupsSchema } from '../schemas/query.js'
import { AssignmentDtoSchema, dataResponse, errorResponse } from '../schemas/responses.js'
import { assignmentToDto, withRelations } from './assignments.js'

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
                'Comma-separated group ids. Homework set on a parent group (the whole year) comes back for its children too, as it does for a student, unless `includeAncestorGroups` is `false`.',
        }),
    includeAncestorGroups: IncludeAncestorGroupsSchema,
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
            "Lets the bot work out a member's class from their roles, from the same table that auto-approves them at sign-in. An unconfigured server answers an empty list.",
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
            'Ordered by due date. `completedByMe` is always false, because there is no "me". To read a member\'s own list, call `GET /api/assignments` with `X-Acting-Discord-User`.',
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
        const { groupIds, includeAncestorGroups, from, to } = c.req.valid('query')
        const scope = await expandGroupIds(groupIds, includeAncestorGroups)

        const rows = await db.query.assignments.findMany({
            where: (a, { and, inArray, gte, lte }) =>
                and(
                    inArray(a.studentGroupId, scope),
                    from ? gte(a.dueDate, from) : undefined,
                    to ? lte(a.dueDate, to) : undefined,
                ),
            with: withRelations,
            orderBy: asc(assignments.dueDate),
        })

        return c.json({ data: rows.map((r) => assignmentToDto(r, null)) }, 200)
    },
)

/**
 * Under Cloudflare's ~100 s and nginx's 60 s idle cuts. Bun's own 10 s one is
 * lifted for this route alone, below.
 */
const HEARTBEAT_MS = 25_000

app.openapi(
    createRoute({
        method: 'get',
        path: '/reminders/stream',
        operationId: 'botStreamReminders',
        summary: 'The DM reminders to send, as Server-Sent Events',
        description:
            'Kept open by the bot. Each `reminder` event is one DM, ready to send: `{ discordUserId, eventId, title, body, startsAt }`, where `eventId` and `startsAt` are null for a test. A `ready` event opens the stream and a `: ping` comment arrives every 25 s. One bot delivers at a time: a new connection closes the previous one. Reminders due while no bot is connected are kept until their course starts, then dropped. Report each DM with `POST /api/bot/reminders/deliveries`.',
        tags: ['Bot'],
        security: [{ Bot: [] }],
        responses: {
            200: {
                content: { 'text/event-stream': { schema: z.string() } },
                description: 'The event stream',
            },
            401: errorResponse('Unauthorized'),
            503: errorResponse('Bot access is not configured'),
        },
    }),
    (c) => {
        // Bun closes a connection after 10 s without traffic, and this one is
        // quiet between reminders by design. Hono hands Bun's server over as
        // `c.env`; it is absent under the tests.
        ;(c.env as { timeout?: (req: Request, seconds: number) => void } | undefined)?.timeout?.(
            c.req.raw,
            0,
        )
        // nginx would otherwise buffer the events until the response ends.
        c.header('X-Accel-Buffering', 'no')

        return streamSSE(c, async (stream) => {
            let open = true
            const detach = attachBot({
                send: (message) =>
                    stream.writeSSE({ event: 'reminder', data: JSON.stringify(message) }),
                close: () => {
                    open = false
                },
            })
            stream.onAbort(() => {
                open = false
                detach()
            })

            await stream.writeSSE({ event: 'ready', data: '{}' })
            while (open) {
                await stream.sleep(HEARTBEAT_MS)
                if (open) await stream.write(': ping\n\n')
            }
            detach()
        })
    },
)

const DeliveryReportSchema = z
    .object({
        discordUserId: z
            .string()
            .regex(/^\d{17,20}$/)
            .openapi({ example: '812340987654321098' }),
        eventId: z.string().uuid().nullable(),
        ok: z.boolean(),
        error: z
            .string()
            .max(300)
            .optional()
            .openapi({ description: 'Why the DM failed, shown to the member in their settings' }),
    })
    .openapi('DiscordReminderDelivery')

app.openapi(
    createRoute({
        method: 'post',
        path: '/reminders/deliveries',
        operationId: 'botReportReminderDelivery',
        summary: 'Report whether a DM reminder reached its member',
        description:
            'What the member sees as the last delivery or the last failure in their reminder settings. A failure does not turn reminders off.',
        tags: ['Bot'],
        security: [{ Bot: [] }],
        request: { body: { content: { 'application/json': { schema: DeliveryReportSchema } } } },
        responses: {
            200: dataResponse(
                z.object({ recorded: z.boolean() }),
                'Recorded, or false when the member has no reminders on',
            ),
            401: errorResponse('Unauthorized'),
            503: errorResponse('Bot access is not configured'),
        },
    }),
    async (c) => {
        const { discordUserId, ok, error } = c.req.valid('json')
        const now = new Date()
        const updated = await db
            .update(discordReminders)
            .set(
                ok
                    ? { lastDeliveredAt: now, lastFailure: null, lastFailureAt: null }
                    : { lastFailure: error ?? 'Unknown error', lastFailureAt: now },
            )
            .where(
                inArray(
                    discordReminders.userId,
                    db
                        .select({ id: userIdentities.userId })
                        .from(userIdentities)
                        .where(
                            and(
                                eq(userIdentities.provider, 'discord'),
                                eq(userIdentities.subject, discordUserId),
                            ),
                        ),
                ),
            )
            .returning({ userId: discordReminders.userId })
        return c.json({ data: { recorded: updated.length > 0 } }, 200)
    },
)

export default app
