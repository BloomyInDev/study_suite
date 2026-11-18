import {
    discordReminders,
    discordReminderSends,
    userIdentities,
    users,
    userStudents,
} from '@studysuite/db'
import { parisParts } from '@studysuite/shared/time'
import { and, eq, isNotNull, lt } from 'drizzle-orm'
import { config } from '../config.js'
import { db } from '../db.js'
import { botConnected, deliverToBot } from './discord-reminder-hub.js'
import { expandGroupIds } from './group-ancestors.js'
import { buildPayload, duePairs } from './reminder-match.js'
import { upcomingEvents } from './reminder-tick.js'

const TICK_MS = 60_000
const SEND_RETENTION_MS = 7 * 24 * 60 * 60 * 1000

/** An account that turned DM reminders on, with what the tick needs to match it. */
interface DiscordSubscriber {
    id: string
    discordUserId: string
    groupIds: string[]
    leadMinutes: number
    excludedTitles: string[]
}

/**
 * The accounts due a look this minute: DM reminders on, approved, a class set
 * and a Discord identity to send to. The class is the account's own, widened
 * to its ancestors, so a promo-wide lecture is announced too. Hidden courses
 * live in each browser and are not known here.
 */
async function loadSubscribers(): Promise<DiscordSubscriber[]> {
    const rows = await db
        .select({
            userId: discordReminders.userId,
            leadMinutes: discordReminders.leadMinutes,
            groupId: userStudents.studentGroupId,
            discordUserId: userIdentities.subject,
        })
        .from(discordReminders)
        .innerJoin(users, eq(users.id, discordReminders.userId))
        .innerJoin(userStudents, eq(userStudents.userId, discordReminders.userId))
        .innerJoin(
            userIdentities,
            and(
                eq(userIdentities.userId, discordReminders.userId),
                eq(userIdentities.provider, 'discord'),
            ),
        )
        .where(and(eq(users.status, 'approved'), isNotNull(userStudents.studentGroupId)))

    const widened = new Map<string, string[]>()
    const subscribers = new Map<string, DiscordSubscriber>()
    for (const row of rows) {
        if (subscribers.has(row.userId)) continue
        const groupId = row.groupId!
        if (!widened.has(groupId)) widened.set(groupId, await expandGroupIds([groupId], true))
        subscribers.set(row.userId, {
            id: row.userId,
            discordUserId: row.discordUserId,
            groupIds: widened.get(groupId)!,
            leadMinutes: row.leadMinutes,
            excludedTitles: [],
        })
    }
    return [...subscribers.values()]
}

/**
 * One pass: find the courses due a DM, claim them, hand them to the bot.
 *
 * Nothing is claimed while no bot is connected. The window is one-sided (due
 * until the course starts, see `duePairs`), so a bot that reconnects within
 * it still gets the reminder, and one that stays away does not burn claims it
 * could never deliver. Once handed over, a reminder is not retried: at most
 * once, like push.
 */
export async function runDiscordReminderTick(now: Date = new Date()): Promise<number> {
    if (!botConnected()) return 0

    const subs = await loadSubscribers()
    if (subs.length === 0) return 0

    const upcoming = await upcomingEvents(now, Math.max(...subs.map((s) => s.leadMinutes)))
    if (upcoming.length === 0) return 0

    const pairs = duePairs(subs, upcoming, now)
    if (pairs.length === 0) return 0

    const claimed = await db
        .insert(discordReminderSends)
        .values(pairs.map(({ sub, event }) => ({ userId: sub.id, eventId: event.id })))
        .onConflictDoNothing()
        .returning({ userId: discordReminderSends.userId, eventId: discordReminderSends.eventId })
    const isClaimed = new Set(claimed.map((c) => `${c.userId}|${c.eventId}`))

    let handed = 0
    for (const { sub, event } of pairs) {
        if (!isClaimed.has(`${sub.id}|${event.id}`)) continue
        const payload = buildPayload(event, now)
        const ok = await deliverToBot({
            discordUserId: sub.discordUserId,
            eventId: event.id,
            title: payload.title,
            body: payload.body,
            startsAt: event.startDate.toISOString(),
        })
        if (ok) handed++
    }
    return handed
}

async function pruneSends(): Promise<void> {
    await db
        .delete(discordReminderSends)
        .where(lt(discordReminderSends.sentAt, new Date(Date.now() - SEND_RETENTION_MS)))
}

/**
 * Starts the minute ticker. A no-op without bot keys: no bot can then open the
 * stream, so there is no one to deliver to.
 */
export function startDiscordReminderTick(): void {
    if (!config.bot) {
        console.log('[discord-reminders] no bot keys configured, DM reminders are off')
        return
    }

    console.log('[discord-reminders] DM reminders on, ticking every 60s')

    setInterval(() => {
        const now = new Date()
        void runDiscordReminderTick(now).catch((err) =>
            console.error('[discord-reminders] tick failed', err),
        )
        if (parisParts(now).minute === 0) {
            void pruneSends().catch((err) => console.error('[discord-reminders] prune failed', err))
        }
    }, TICK_MS)
}
