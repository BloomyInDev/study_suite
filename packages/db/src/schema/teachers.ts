import { pgTable, text, unique, uuid } from 'drizzle-orm/pg-core'

export const teachers = pgTable(
  'teachers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
  },
  t => [unique('teachers_name_unique').on(t.firstName, t.lastName)],
)
