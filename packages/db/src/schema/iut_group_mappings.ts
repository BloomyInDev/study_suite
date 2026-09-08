import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { studentGroups } from './student_groups.js'

/**
 * Maps one entry of the IUT bridge's `groups` claim to a role and a class, the
 * way `discord_role_mappings` does for a Discord role.
 *
 * The directory only carries the population and the year (`etudiants`, `ann3`),
 * not the TD group, so the class this points at is an anchor: the student
 * narrows it down themselves through `PATCH /api/auth/me/student-group`.
 */
export const iutGroupMappings = pgTable('iut_group_mappings', {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Lowercased, as the claim is matched case-insensitively. */
    claimValue: text('claim_value').notNull().unique(),
    userRole: text('user_role', { enum: ['student', 'teacher'] })
        .notNull()
        .default('student'),
    studentGroupId: uuid('student_group_id').references(() => studentGroups.id, {
        onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
