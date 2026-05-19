import { pgTable, primaryKey, uuid } from 'drizzle-orm/pg-core'
import { studentGroups } from './student_groups.js'

export const studentGroupMemberships = pgTable(
  'student_group_memberships',
  {
    parentId: uuid('parent_id')
      .notNull()
      .references(() => studentGroups.id, { onDelete: 'cascade' }),
    childId: uuid('child_id')
      .notNull()
      .references(() => studentGroups.id, { onDelete: 'cascade' }),
  },
  t => [primaryKey({ columns: [t.parentId, t.childId] })],
)
