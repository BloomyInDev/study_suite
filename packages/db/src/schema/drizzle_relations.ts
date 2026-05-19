import { relations } from 'drizzle-orm'
import { eventLocations, eventStudentGroups, eventTeachers } from './event_relations.js'
import { events } from './events.js'
import { locations } from './locations.js'
import { studentGroupMemberships } from './student_group_memberships.js'
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

export const studentGroupsRelations = relations(studentGroups, ({ many }) => ({
  parentMemberships: many(studentGroupMemberships, { relationName: 'children' }),
  childMemberships: many(studentGroupMemberships, { relationName: 'parents' }),
}))

export const studentGroupMembershipsRelations = relations(studentGroupMemberships, ({ one }) => ({
  parent: one(studentGroups, {
    fields: [studentGroupMemberships.parentId],
    references: [studentGroups.id],
    relationName: 'children',
  }),
  child: one(studentGroups, {
    fields: [studentGroupMemberships.childId],
    references: [studentGroups.id],
    relationName: 'parents',
  }),
}))
