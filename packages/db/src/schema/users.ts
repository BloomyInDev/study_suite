import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
    id: uuid('id').primaryKey().defaultRandom(),
    /**
     * Superseded by `user_identities`. Still written on every Discord login so
     * a rollback keeps working; drop once that has baked.
     */
    discordId: text('discord_id').unique(),
    discordUsername: text('discord_username'),
    discordAvatar: text('discord_avatar'),
    isAdmin: boolean('is_admin').notNull().default(false),
    status: text('status', { enum: ['pending', 'approved', 'rejected'] })
        .notNull()
        .default('pending'),
    discordAccessToken: text('discord_access_token'),
    discordTokenExpiresAt: timestamp('discord_token_expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
