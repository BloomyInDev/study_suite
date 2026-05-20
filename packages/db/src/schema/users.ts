import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { studentGroups } from './student_groups.js'
import { teachers } from './teachers.js'

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  discordId: text('discord_id').notNull().unique(),
  discordUsername: text('discord_username').notNull(),
  discordAvatar: text('discord_avatar'),
  role: text('role', { enum: ['student', 'teacher'] }),
  isAdmin: boolean('is_admin').notNull().default(false),
  status: text('status', { enum: ['pending', 'approved', 'rejected'] }).notNull().default('pending'),
  studentGroupId: uuid('student_group_id').references(() => studentGroups.id, { onDelete: 'set null' }),
  teacherId: uuid('teacher_id').references(() => teachers.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
