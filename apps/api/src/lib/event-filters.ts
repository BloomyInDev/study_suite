import { events, eventLocations, eventStudentGroups, eventTeachers } from '@studysuite/db'
import { eq, gte, inArray, lt, notInArray, type SQL } from 'drizzle-orm'
import { db } from '../db.js'

export type EventFilters = {
    from?: Date
    to?: Date
    teacherId?: string
    roomId?: string
    /** Already resolved: see `expandGroupIds`. An event in any of them matches. */
    groupIds?: string[]
    excludeTitle?: string[]
}

/** Leaves out the courses a user hid. Undefined when there is nothing to hide. */
export function excludeTitlesCondition(titles: string[] | undefined): SQL | undefined {
    return titles && titles.length > 0 ? notInArray(events.title, titles) : undefined
}

/** Conditions for the event list filters, shared by the JSON and iCal endpoints. */
export function eventFilterConditions(filters: EventFilters): (SQL | undefined)[] {
    const conditions: (SQL | undefined)[] = []
    if (filters.from) conditions.push(gte(events.startDate, filters.from))
    if (filters.to) conditions.push(lt(events.startDate, filters.to))
    conditions.push(excludeTitlesCondition(filters.excludeTitle))
    if (filters.teacherId) {
        conditions.push(
            inArray(
                events.id,
                db
                    .select({ id: eventTeachers.eventId })
                    .from(eventTeachers)
                    .where(eq(eventTeachers.teacherId, filters.teacherId)),
            ),
        )
    }
    if (filters.roomId) {
        conditions.push(
            inArray(
                events.id,
                db
                    .select({ id: eventLocations.eventId })
                    .from(eventLocations)
                    .where(eq(eventLocations.locationId, filters.roomId)),
            ),
        )
    }
    if (filters.groupIds) {
        conditions.push(
            inArray(
                events.id,
                db
                    .select({ id: eventStudentGroups.eventId })
                    .from(eventStudentGroups)
                    .where(inArray(eventStudentGroups.studentGroupId, filters.groupIds)),
            ),
        )
    }
    return conditions
}
