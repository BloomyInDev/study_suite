import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { studentGroups } from './student_groups.js'

export const discordRoleMappings = pgTable('discord_role_mappings', {
  id: uuid('id').primaryKey().defaultRandom(),
  discordGuildId: text('discord_guild_id').notNull(),
  discordRoleId: text('discord_role_id').notNull().unique(),
  studentGroupId: uuid('student_group_id').notNull().references(() => studentGroups.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
