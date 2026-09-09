import { index, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { users } from './users.js'

/**
 * One row per browser that asked for course reminders.
 *
 * `user_id` is nullable on purpose: the event routes are public and `/profile`
 * already serves visitors who picked their groups locally, so requiring an
 * account here would make reminders the one feature that demands one. A visitor
 * carries their own `group_ids`; an account holder's are refreshed from their
 * class whenever the client re-subscribes.
 *
 * `endpoint` is the push service's URL for this browser and is the natural
 * identity — a browser that re-subscribes hands back the same one, so the
 * client upserts on it rather than accumulating dead rows.
 */
export const pushSubscriptions = pgTable(
    'push_subscriptions',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
        endpoint: text('endpoint').notNull().unique(),
        /** The subscription's P-256 public key, for the RFC 8291 payload encryption. */
        p256dh: text('p256dh').notNull(),
        /** The subscription's 16-byte auth secret, same purpose. */
        auth: text('auth').notNull(),
        /**
         * Group ids, ancestors included — the client widens them the same way
         * `GET /api/events` callers have to, or a promo-wide lecture tagged on
         * `BUT1` never matches a subscriber who follows `S5`.
         */
        groupIds: uuid('group_ids').array().notNull().default([]),
        /** How long before a course to notify. */
        leadMinutes: integer('lead_minutes').notNull().default(15),
        /** Consecutive send failures; a push service 410 deletes the row outright. */
        failureCount: integer('failure_count').notNull().default(0),
        lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [index('push_subscriptions_user_id_idx').on(t.userId)],
)

/**
 * What has already been announced, so a course is never notified twice.
 *
 * The reminder tick inserts here *before* sending and only pushes the rows the
 * insert actually created (`ON CONFLICT DO NOTHING` + `RETURNING`). That makes
 * the send idempotent for free: an api restart mid-tick, or a second replica
 * running the same minute, re-reads the same window and finds nothing to do.
 */
export const pushReminderSends = pgTable(
    'push_reminder_sends',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        subscriptionId: uuid('subscription_id')
            .notNull()
            .references(() => pushSubscriptions.id, { onDelete: 'cascade' }),
        /**
         * No foreign key to `events`: the reconciler deletes and re-inserts rows
         * on every scrape, and a cascade would drop the record of a reminder
         * that was genuinely sent, letting the next tick send it again.
         */
        eventId: uuid('event_id').notNull(),
        sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
        unique('push_reminder_sends_subscription_event_uniq').on(t.subscriptionId, t.eventId),
        index('push_reminder_sends_sent_at_idx').on(t.sentAt),
    ],
)
