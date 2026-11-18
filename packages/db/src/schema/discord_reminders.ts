import { index, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { users } from './users.js'

/**
 * Course reminders sent as Discord DMs by the bot, one row per account that
 * turned them on.
 *
 * Keyed on the account rather than a Discord id: the bot calls as the member
 * (`X-Acting-Discord-User`), the tick reads the account's class, and the row
 * dies with the account. The bot stores nothing; it only delivers what the
 * api's stream hands it.
 */
export const discordReminders = pgTable('discord_reminders', {
    userId: uuid('user_id')
        .primaryKey()
        .references(() => users.id, { onDelete: 'cascade' }),
    /** How long before a course to send the DM. */
    leadMinutes: integer('lead_minutes').notNull().default(15),
    /** The last DM the bot reported as delivered. */
    lastDeliveredAt: timestamp('last_delivered_at', { withTimezone: true }),
    /**
     * Why the last DM failed, as the bot reported it (the member closed their
     * DMs, left every shared server). Cleared by the next delivery.
     */
    lastFailure: text('last_failure'),
    lastFailureAt: timestamp('last_failure_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * Which DM reminder has already been handed to the bot, the Discord twin of
 * `push_reminder_sends`. The tick claims a row before streaming it, so a
 * restart or a second tick never sends the same course twice.
 */
export const discordReminderSends = pgTable(
    'discord_reminder_sends',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        /** No foreign key, for the reason given on `push_reminder_sends.event_id`. */
        eventId: uuid('event_id').notNull(),
        sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
        unique('discord_reminder_sends_user_event_uniq').on(t.userId, t.eventId),
        index('discord_reminder_sends_sent_at_idx').on(t.sentAt),
    ],
)
