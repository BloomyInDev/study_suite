import { pgTable, uuid } from 'drizzle-orm/pg-core'
import { studentGroups } from './student_groups.js'
import { users } from './users.js'

export const userStudents = pgTable('user_students', {
    userId: uuid('user_id')
        .primaryKey()
        .references(() => users.id, { onDelete: 'cascade' }),
    /** The class in use, which the student may narrow down themselves. */
    studentGroupId: uuid('student_group_id').references(() => studentGroups.id, {
        onDelete: 'set null',
    }),
    /**
     * The class staff assigned, via a Discord role mapping or the admin page.
     * A student may move anywhere at or below it, never outside it.
     */
    assignedGroupId: uuid('assigned_group_id').references(() => studentGroups.id, {
        onDelete: 'set null',
    }),
})
