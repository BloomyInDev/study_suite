import { pgTable, primaryKey, uuid } from 'drizzle-orm/pg-core'
import { events } from './events.js'
import { locations } from './locations.js'
import { studentGroups } from './student_groups.js'
import { teachers } from './teachers.js'

export const eventLocations = pgTable(
  'event_locations',
  {
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'cascade' }),
  },
  t => [primaryKey({ columns: [t.eventId, t.locationId] })],
)

export const eventTeachers = pgTable(
  'event_teachers',
  {
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    teacherId: uuid('teacher_id')
      .notNull()
      .references(() => teachers.id, { onDelete: 'cascade' }),
  },
  t => [primaryKey({ columns: [t.eventId, t.teacherId] })],
)

export const eventStudentGroups = pgTable(
  'event_student_groups',
  {
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    studentGroupId: uuid('student_group_id')
      .notNull()
      .references(() => studentGroups.id, { onDelete: 'cascade' }),
  },
  t => [primaryKey({ columns: [t.eventId, t.studentGroupId] })],
)
