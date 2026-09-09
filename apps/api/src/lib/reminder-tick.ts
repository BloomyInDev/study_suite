import { and, asc, eq, gt, inArray, lt, lte, sql } from 'drizzle-orm'
import { events, pushReminderSends, pushSubscriptions } from '@studysuite/db'
import { wallClockNow } from '@studysuite/shared/time'
import { db } from '../db.js'
import { withEventRelations } from './serialize.js'
import { pushConfigured, sendReminder } from './push.js'
import { buildPayload, duePairs } from './reminder-match.js'

const TICK_MS = 60_000
/** How long a send record is kept before it is pruned. */
const SEND_RETENTION_MS = 7 * 24 * 60 * 60 * 1000

/**
 * One pass: find the courses due a reminder, claim them, push them.
 *
 * Claiming happens *before* sending — the insert into `push_reminder_sends` is
 * `ON CONFLICT DO NOTHING … RETURNING`, so only the rows this pass actually
 * created get pushed. That is what makes the tick idempotent: an api restart
 * mid-minute, or a second replica running the same window, claims nothing and
 * sends nothing.
 *
 * Volumes are small by construction — a department's worth of subscriptions and
 * the events of the next hour — so the matching runs in JS rather than as a
 * join against a `uuid[]` column.
 */
export async function runReminderTick(now: Date = wallClockNow()): Promise<number> {
    if (!pushConfigured) return 0

    const subs = await db.select().from(pushSubscriptions)
    if (subs.length === 0) return 0

    // Only ever the widest lead anyone asked for; `duePairs` narrows per
    // subscriber from there.
    const maxLead = Math.max(...subs.map((s) => s.leadMinutes))
    const upcoming = await db.query.events.findMany({
        where: and(
            gt(events.startDate, now),
            lte(events.startDate, new Date(now.getTime() + maxLead * 60_000)),
        ),
        with: withEventRelations,
        orderBy: asc(events.startDate),
    })
    if (upcoming.length === 0) return 0

    const pairs = duePairs(subs, upcoming, now)
    if (pairs.length === 0) return 0

    const claimed = await db
        .insert(pushReminderSends)
        .values(pairs.map(({ sub, event }) => ({ subscriptionId: sub.id, eventId: event.id })))
        .onConflictDoNothing()
        .returning({
            subscriptionId: pushReminderSends.subscriptionId,
            eventId: pushReminderSends.eventId,
        })

    const isClaimed = new Set(claimed.map((c) => `${c.subscriptionId}|${c.eventId}`))
    const gone: string[] = []
    let sent = 0

    for (const { sub, event } of pairs) {
        if (!isClaimed.has(`${sub.id}|${event.id}`)) continue

        // Expire the push with the course it announces: a phone that was off
        // should not be told about a class that started an hour ago.
        const ttl = Math.max(60, Math.round((event.startDate.getTime() - now.getTime()) / 1000))
        const result = await sendReminder(sub, buildPayload(event, now), ttl)

        if (result === 'gone') {
            gone.push(sub.id)
        } else if (result === 'sent') {
            sent++
            await db
                .update(pushSubscriptions)
                .set({ failureCount: 0, lastSuccessAt: new Date() })
                .where(eq(pushSubscriptions.id, sub.id))
        } else {
            // The claim stays: retrying a reminder whose course has meanwhile
            // started is worse than dropping it.
            await db
                .update(pushSubscriptions)
                .set({ failureCount: sql`${pushSubscriptions.failureCount} + 1` })
                .where(eq(pushSubscriptions.id, sub.id))
        }
    }

    // The browser is never coming back for these; their send records cascade.
    if (gone.length > 0) {
        await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, [...new Set(gone)]))
    }

    return sent
}

async function pruneSends(): Promise<void> {
    await db
        .delete(pushReminderSends)
        .where(lt(pushReminderSends.sentAt, new Date(Date.now() - SEND_RETENTION_MS)))
}

/**
 * Starts the minute ticker. A no-op when no VAPID keypair is configured, which
 * is how a deployment opts out of reminders entirely.
 */
export function startReminderTick(): void {
    if (!pushConfigured) {
        console.log('[push] no VAPID keypair configured — course reminders are off')
        return
    }

    console.log('[push] course reminders on, ticking every 60s')

    setInterval(() => {
        const now = wallClockNow()
        void runReminderTick(now).catch((err) => console.error('[push] tick failed', err))
        // Hourly, not every tick: the retention window is a week, so there is
        // nothing to gain from chasing it 1440 times a day.
        if (now.getUTCMinutes() === 0) {
            void pruneSends().catch((err) => console.error('[push] prune failed', err))
        }
    }, TICK_MS)
}
