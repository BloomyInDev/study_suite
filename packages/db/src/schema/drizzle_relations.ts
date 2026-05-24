import { relations } from 'drizzle-orm'
import { eventLocations, eventStudentGroups, eventTeachers } from './event_relations.js'
import { events } from './events.js'
import { locations } from './locations.js'
import { studentGroupMemberships } from './student_group_memberships.js'
import { studentGroups } from './student_groups.js'
import { teachers } from './teachers.js'
import { users } from './users.js'
import { userStudents } from './user_students.js'
import { userTeachers } from './user_teachers.js'
import { discordGuilds } from './discord_guilds.js'
import { discordRoleMappings } from './discord_role_mappings.js'
import { assignments } from './assignments.js'
import { assignmentCompletions } from './assignment_completions.js'

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
    discordRoleMappings: many(discordRoleMappings),
    userStudents: many(userStudents),
    assignments: many(assignments),
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

export const usersRelations = relations(users, ({ one, many }) => ({
    studentProfile: one(userStudents, {
        fields: [users.id],
        references: [userStudents.userId],
    }),
    teacherProfile: one(userTeachers, {
        fields: [users.id],
        references: [userTeachers.userId],
    }),
    createdAssignments: many(assignments, { relationName: 'assignment_creator' }),
    updatedAssignments: many(assignments, { relationName: 'assignment_updater' }),
}))

export const userStudentsRelations = relations(userStudents, ({ one }) => ({
    user: one(users, { fields: [userStudents.userId], references: [users.id] }),
    studentGroup: one(studentGroups, {
        fields: [userStudents.studentGroupId],
        references: [studentGroups.id],
    }),
}))

export const userTeachersRelations = relations(userTeachers, ({ one }) => ({
    user: one(users, { fields: [userTeachers.userId], references: [users.id] }),
    teacher: one(teachers, { fields: [userTeachers.teacherId], references: [teachers.id] }),
}))

export const discordGuildsRelations = relations(discordGuilds, ({ many }) => ({
    roleMappings: many(discordRoleMappings),
}))

export const discordRoleMappingsRelations = relations(discordRoleMappings, ({ one }) => ({
    guild: one(discordGuilds, {
        fields: [discordRoleMappings.guildId],
        references: [discordGuilds.id],
    }),
    studentGroup: one(studentGroups, {
        fields: [discordRoleMappings.studentGroupId],
        references: [studentGroups.id],
    }),
}))

export const assignmentsRelations = relations(assignments, ({ one, many }) => ({
    studentGroup: one(studentGroups, {
        fields: [assignments.studentGroupId],
        references: [studentGroups.id],
    }),
    event: one(events, {
        fields: [assignments.eventId],
        references: [events.id],
    }),
    createdBy: one(users, {
        fields: [assignments.createdById],
        references: [users.id],
        relationName: 'assignment_creator',
    }),
    updatedBy: one(users, {
        fields: [assignments.updatedById],
        references: [users.id],
        relationName: 'assignment_updater',
    }),
    completions: many(assignmentCompletions),
}))

export const assignmentCompletionsRelations = relations(assignmentCompletions, ({ one }) => ({
    assignment: one(assignments, {
        fields: [assignmentCompletions.assignmentId],
        references: [assignments.id],
    }),
    user: one(users, {
        fields: [assignmentCompletions.userId],
        references: [users.id],
    }),
}))
