import { pgTable, text, uuid } from 'drizzle-orm/pg-core'

export const studentGroups = pgTable('student_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  internalName: text('internal_name').notNull().unique(),
})
