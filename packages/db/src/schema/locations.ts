import { pgTable, text, uuid } from 'drizzle-orm/pg-core'

export const locations = pgTable('locations', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull().unique(),
})
