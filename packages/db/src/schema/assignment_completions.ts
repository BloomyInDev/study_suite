import { pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core'
import { assignments } from './assignments.js'
import { users } from './users.js'

export const assignmentCompletions = pgTable(
    'assignment_completions',
    {
        assignmentId: uuid('assignment_id')
            .notNull()
            .references(() => assignments.id, { onDelete: 'cascade' }),
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        completedAt: timestamp('completed_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [primaryKey({ columns: [t.assignmentId, t.userId] })],
)
