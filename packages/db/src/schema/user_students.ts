import { pgTable, uuid } from 'drizzle-orm/pg-core'
import { studentGroups } from './student_groups.js'
import { users } from './users.js'

export const userStudents = pgTable('user_students', {
    userId: uuid('user_id')
        .primaryKey()
        .references(() => users.id, { onDelete: 'cascade' }),
    studentGroupId: uuid('student_group_id').references(() => studentGroups.id, {
        onDelete: 'set null',
    }),
})
