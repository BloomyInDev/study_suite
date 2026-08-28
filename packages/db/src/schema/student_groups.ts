import { boolean, pgTable, text, uuid } from 'drizzle-orm/pg-core'

export const studentGroups = pgTable('student_groups', {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Name as published by Prose Consult. The scraper matches on this, never rename it. */
    internalName: text('internal_name').notNull().unique(),
    /** Human-facing label; falls back to internalName when null. */
    displayName: text('display_name'),
    /** Kept out of listings and pickers (scrape artifacts, other departments). */
    hidden: boolean('hidden').notNull().default(false),
})
