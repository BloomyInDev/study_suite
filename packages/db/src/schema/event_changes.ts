import { jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const changeTypeEnum = pgEnum('change_type', ['added', 'removed', 'updated', 'moved'])

export const eventChanges = pgTable('event_changes', {
  id: uuid('id').primaryKey().defaultRandom(),
  changeType: changeTypeEnum('change_type').notNull(),
  eventTitle: text('event_title').notNull(),
  startDate: timestamp('start_date', { withTimezone: true }).notNull(),
  endDate: timestamp('end_date', { withTimezone: true }).notNull(),
  diff: jsonb('diff'),
  detectedAt: timestamp('detected_at', { withTimezone: true }).notNull().defaultNow(),
})
