import { relations } from 'drizzle-orm'
import { eventLocations, eventStudentGroups, eventTeachers } from './event_relations.js'
import { events } from './events.js'
import { locations } from './locations.js'
import { studentGroups } from './student_groups.js'
import { teachers } from './teachers.js'

export const eventsRelations = relations(events, ({ many }) => ({
  eventLocations: many(eventLocations),
  eventTeachers: many(eventTeachers),
  eventStudentGroups: many(eventStudentGroups),
}))

export const eventLocationsRelations = relations(eventLocations, ({ one }) => ({
  event: one(events, { fields: [eventLocations.eventId], references: [events.id] }),
  location: one(locations, { fields: [eventLocations.locationId], references: [locations.id] }),
}))

export const eventTeachersRelations = relations(eventTeachers, ({ one }) => ({
  event: one(events, { fields: [eventTeachers.eventId], references: [events.id] }),
  teacher: one(teachers, { fields: [eventTeachers.teacherId], references: [teachers.id] }),
}))

export const eventStudentGroupsRelations = relations(eventStudentGroups, ({ one }) => ({
  event: one(events, { fields: [eventStudentGroups.eventId], references: [events.id] }),
  studentGroup: one(studentGroups, {
    fields: [eventStudentGroups.studentGroupId],
    references: [studentGroups.id],
  }),
}))
