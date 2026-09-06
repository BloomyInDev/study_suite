import { jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const changeTypeEnum = pgEnum('change_type', ['added', 'removed', 'updated', 'moved'])

export const eventChanges = pgTable('event_changes', {
    id: uuid('id').primaryKey().defaultRandom(),
    changeType: changeTypeEnum('change_type').notNull(),
    eventTitle: text('event_title').notNull(),
    startDate: timestamp('start_date', { withTimezone: true }).notNull(),
    endDate: timestamp('end_date', { withTimezone: true }).notNull(),
    /**
     * The internal names of the groups the event concerned, so a change can be
     * shown to the students it affects. Denormalised on purpose: the event row
     * itself is gone by the time a `removed` change is read back.
     */
    groups: text('groups').array().notNull().default([]),
    diff: jsonb('diff'),
    detectedAt: timestamp('detected_at', { withTimezone: true }).notNull().defaultNow(),
})
