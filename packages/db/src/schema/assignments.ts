import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { events } from './events.js'
import { studentGroups } from './student_groups.js'
import { users } from './users.js'

export const assignments = pgTable('assignments', {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    description: text('description'),
    dueDate: timestamp('due_date', { withTimezone: true }).notNull(),
    studentGroupId: uuid('student_group_id')
        .notNull()
        .references(() => studentGroups.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id').references(() => events.id, { onDelete: 'set null' }),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
