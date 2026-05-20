import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const discordGuilds = pgTable('discord_guilds', {
  id: uuid('id').primaryKey().defaultRandom(),
  discordGuildId: text('discord_guild_id').notNull().unique(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
