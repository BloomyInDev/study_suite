import { pgTable, uuid } from 'drizzle-orm/pg-core'
import { teachers } from './teachers.js'
import { users } from './users.js'

export const userTeachers = pgTable('user_teachers', {
    userId: uuid('user_id')
        .primaryKey()
        .references(() => users.id, { onDelete: 'cascade' }),
    teacherId: uuid('teacher_id').references(() => teachers.id, { onDelete: 'set null' }),
})
