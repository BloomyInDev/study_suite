import { index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { users } from './users.js'

/**
 * One row per external account a user signs in with. `users` used to *be* the
 * Discord identity — `discord_id NOT NULL UNIQUE` — which left no room for a
 * second provider.
 */
export const userIdentities = pgTable(
    'user_identities',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        provider: text('provider', { enum: ['discord', 'iut'] }).notNull(),
        /**
         * What we key the account on. Discord: the snowflake. IUT: the LDAP
         * `preferred_username` (`lubenb`) — *not* the OIDC `sub`, which the
         * bridge builds from the DN (`uid=lubenb,ou=Ann3,…`) and therefore
         * changes at every year rollover, orphaning the account each September.
         */
        subject: text('subject').notNull(),
        /** The `sub` the IdP actually sent. Diagnostics only; never matched on. */
        providerSubRaw: text('provider_sub_raw'),
        username: text('username'),
        email: text('email'),
        avatarUrl: text('avatar_url'),
        accessToken: text('access_token'),
        tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
        unique('user_identities_provider_subject_uniq').on(t.provider, t.subject),
        index('user_identities_user_id_idx').on(t.userId),
    ],
)
