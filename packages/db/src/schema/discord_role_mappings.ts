import { pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { discordGuilds } from './discord_guilds.js'
import { studentGroups } from './student_groups.js'

export const discordRoleMappings = pgTable(
    'discord_role_mappings',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        guildId: uuid('guild_id')
            .notNull()
            .references(() => discordGuilds.id, { onDelete: 'cascade' }),
        discordRoleId: text('discord_role_id').notNull(),
        studentGroupId: uuid('student_group_id')
            .notNull()
            .references(() => studentGroups.id, { onDelete: 'cascade' }),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [unique('discord_role_mappings_guild_role_uniq').on(t.guildId, t.discordRoleId)],
)
