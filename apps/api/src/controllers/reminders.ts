import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { discordReminders, studentGroups, userIdentities, userStudents } from '@studysuite/db'
import {
    DEFAULT_REMINDER_LEAD,
    isReminderLead,
    REMINDER_LEAD_CHOICES,
} from '@studysuite/shared/reminders'
import { and, eq } from 'drizzle-orm'
import { db } from '../db.js'
import { botConnected, deliverToBot } from '../lib/discord-reminder-hub.js'
import { requireAuth, type AuthEnv } from '../middleware/auth.js'
import { dataResponse, errorResponse } from '../schemas/responses.js'

/**
 * A member's Discord DM reminders, read and changed as that member: by the bot
 * with `X-Acting-Discord-User`, which is how its settings panel calls, or by
 * the site with a token. Everything the panel shows comes from here, so the
 * bot keeps no state of its own.
 */

const BLOCKERS = ['not-approved', 'no-class', 'no-discord'] as const

const DiscordReminderSettingsSchema = z
    .object({
        enabled: z.boolean(),
        leadMinutes: z.number().int().openapi({ example: 15 }),
        leadChoices: z.array(z.number().int()).openapi({ example: [...REMINDER_LEAD_CHOICES] }),
        /** The account's class, whose courses (ancestors included) are announced. */
        studentGroup: z
            .object({ id: z.string().uuid(), name: z.string().openapi({ example: 'G1' }) })
            .nullable(),
        blocker: z.enum(BLOCKERS).nullable().openapi({
            description:
                'Why no DM would be sent even when enabled: the account awaits approval, has no class, or has no Discord identity to send to. Null when nothing stands in the way.',
        }),
        botConnected: z.boolean(),
        lastDeliveredAt: z.string().datetime().nullable(),
        lastFailure: z.string().nullable(),
        lastFailureAt: z.string().datetime().nullable(),
    })
    .openapi('DiscordReminderSettings')
type DiscordReminderSettings = z.infer<typeof DiscordReminderSettingsSchema>

const LeadSchema = z
    .object({
        leadMinutes: z
            .number()
            .int()
            .refine(isReminderLead, { message: `One of ${REMINDER_LEAD_CHOICES.join(', ')}` })
            .openapi({ example: 15 }),
    })
    .openapi('DiscordReminderInput')

async function loadSettings(userId: string, approved: boolean): Promise<DiscordReminderSettings> {
    const [[row], [student], [identity]] = await Promise.all([
        db.select().from(discordReminders).where(eq(discordReminders.userId, userId)),
        db
            .select({
                id: studentGroups.id,
                internalName: studentGroups.internalName,
                displayName: studentGroups.displayName,
            })
            .from(userStudents)
            .innerJoin(studentGroups, eq(studentGroups.id, userStudents.studentGroupId))
            .where(eq(userStudents.userId, userId)),
        db
            .select({ subject: userIdentities.subject })
            .from(userIdentities)
            .where(and(eq(userIdentities.userId, userId), eq(userIdentities.provider, 'discord')))
            .limit(1),
    ])

    const blocker = !approved
        ? 'not-approved'
        : !student
          ? 'no-class'
          : !identity
            ? 'no-discord'
            : null

    return {
        enabled: row !== undefined,
        leadMinutes: row?.leadMinutes ?? DEFAULT_REMINDER_LEAD,
        leadChoices: [...REMINDER_LEAD_CHOICES],
        studentGroup: student
            ? { id: student.id, name: student.displayName ?? student.internalName }
            : null,
        blocker,
        botConnected: botConnected(),
        lastDeliveredAt: row?.lastDeliveredAt?.toISOString() ?? null,
        lastFailure: row?.lastFailure ?? null,
        lastFailureAt: row?.lastFailureAt?.toISOString() ?? null,
    }
}

const settingsResponses = {
    200: dataResponse(DiscordReminderSettingsSchema, 'The member’s DM reminder settings'),
    401: errorResponse('Unauthorized'),
    403: errorResponse('The Discord user has no linked account (`NOT_LINKED`)'),
}

const app = new OpenAPIHono<AuthEnv>()
app.use(requireAuth)

app.openapi(
    createRoute({
        method: 'get',
        path: '/discord',
        operationId: 'getDiscordReminders',
        summary: 'Read my Discord DM reminder settings',
        description:
            'Everything a settings panel shows: whether reminders are on, the lead time and its choices, the class they follow, what would stop them, whether the bot is connected, and the last delivery or failure.',
        tags: ['Reminders'],
        security: [{ Bearer: [] }],
        responses: settingsResponses,
    }),
    async (c) => {
        const user = c.get('user')
        return c.json({ data: await loadSettings(user.sub, user.status === 'approved') }, 200)
    },
)

app.openapi(
    createRoute({
        method: 'put',
        path: '/discord',
        operationId: 'enableDiscordReminders',
        summary: 'Turn my Discord DM reminders on, or change their lead time',
        tags: ['Reminders'],
        security: [{ Bearer: [] }],
        request: { body: { content: { 'application/json': { schema: LeadSchema } } } },
        responses: { ...settingsResponses, 400: errorResponse('Not one of the lead choices') },
    }),
    async (c) => {
        const user = c.get('user')
        const { leadMinutes } = c.req.valid('json')
        await db
            .insert(discordReminders)
            .values({ userId: user.sub, leadMinutes })
            .onConflictDoUpdate({
                target: discordReminders.userId,
                set: { leadMinutes, updatedAt: new Date() },
            })
        return c.json({ data: await loadSettings(user.sub, user.status === 'approved') }, 200)
    },
)

app.openapi(
    createRoute({
        method: 'delete',
        path: '/discord',
        operationId: 'disableDiscordReminders',
        summary: 'Turn my Discord DM reminders off',
        tags: ['Reminders'],
        security: [{ Bearer: [] }],
        responses: settingsResponses,
    }),
    async (c) => {
        const user = c.get('user')
        await db.delete(discordReminders).where(eq(discordReminders.userId, user.sub))
        return c.json({ data: await loadSettings(user.sub, user.status === 'approved') }, 200)
    },
)

app.openapi(
    createRoute({
        method: 'post',
        path: '/discord/test',
        operationId: 'testDiscordReminders',
        summary: 'Have the bot send me a test DM now',
        description:
            '`sent` means the bot was handed the DM; whether it arrived shows up as the next delivery or failure in the settings. `no-bot`: no bot is connected. `no-discord`: the account has no Discord identity to send to.',
        tags: ['Reminders'],
        security: [{ Bearer: [] }],
        responses: {
            200: dataResponse(
                z.object({ result: z.enum(['sent', 'no-bot', 'no-discord']) }),
                'What became of the test',
            ),
            401: errorResponse('Unauthorized'),
            403: errorResponse('The Discord user has no linked account (`NOT_LINKED`)'),
        },
    }),
    async (c) => {
        const user = c.get('user')
        const [identity] = await db
            .select({ subject: userIdentities.subject })
            .from(userIdentities)
            .where(and(eq(userIdentities.userId, user.sub), eq(userIdentities.provider, 'discord')))
            .limit(1)
        if (!identity) return c.json({ data: { result: 'no-discord' as const } }, 200)

        const [row] = await db
            .select({ leadMinutes: discordReminders.leadMinutes })
            .from(discordReminders)
            .where(eq(discordReminders.userId, user.sub))
        const lead = row?.leadMinutes ?? DEFAULT_REMINDER_LEAD
        const sent = await deliverToBot({
            discordUserId: identity.subject,
            eventId: null,
            title: 'Rappels de cours',
            body: `Ceci est un test : tes rappels arriveront ici, ${lead} min avant chaque cours.`,
            startsAt: null,
        })
        return c.json({ data: { result: sent ? ('sent' as const) : ('no-bot' as const) } }, 200)
    },
)

export default app
