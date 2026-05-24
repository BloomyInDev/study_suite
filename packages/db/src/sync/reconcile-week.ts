import type { ParsedEvent } from '@studysuite/shared'
import { and, eq, gte, inArray, lt } from 'drizzle-orm'
import type { createDb } from '../client.js'
import {
    eventChanges,
    eventLocations,
    eventStudentGroups,
    eventTeachers,
    events,
    locations,
    studentGroups,
    teachers,
} from '../schema/index.js'

type Db = ReturnType<typeof createDb>

export interface EventSlot {
    title: string
    startDate: Date
    endDate: Date
    relKey: string
}

export interface UpdatedEventChange {
    title: string
    startDate: Date
    endDate: Date
    diff: {
        before: {
            rooms: string[]
            teachers: { firstName: string; lastName: string }[]
            groups: string[]
        }
        after: {
            rooms: string[]
            teachers: { firstName: string; lastName: string }[]
            groups: string[]
        }
    }
}

export interface WeekDiff {
    added: EventSlot[]
    removed: EventSlot[]
    updated: UpdatedEventChange[]
}

function eventKey(title: string, start: Date, end: Date): string {
    return `${title}|${start.toISOString()}|${end.toISOString()}`
}

function relationsKey(ev: ParsedEvent): string {
    const rooms = ev.rooms
        .map((r) => r.name)
        .sort()
        .join(',')
    const tchrs = ev.teachers
        .map((t) => `${t.lastName}:${t.firstName}`)
        .sort()
        .join(',')
    const groups = ev.groups
        .map((g) => g.internalName)
        .sort()
        .join(',')
    return `${rooms}|${tchrs}|${groups}`
}

function existingRelationsKey(existing: {
    eventLocations: Array<{ location: { name: string } }>
    eventTeachers: Array<{ teacher: { firstName: string; lastName: string } }>
    eventStudentGroups: Array<{ studentGroup: { internalName: string } }>
}): string {
    return [
        existing.eventLocations
            .map((el) => el.location.name)
            .sort()
            .join(','),
        existing.eventTeachers
            .map((et) => `${et.teacher.lastName}:${et.teacher.firstName}`)
            .sort()
            .join(','),
        existing.eventStudentGroups
            .map((eg) => eg.studentGroup.internalName)
            .sort()
            .join(','),
    ].join('|')
}

async function getOrCreateLocation(
    tx: Parameters<Parameters<Db['transaction']>[0]>[0],
    name: string,
): Promise<string> {
    await tx.insert(locations).values({ name }).onConflictDoNothing()
    const [row] = await tx
        .select({ id: locations.id })
        .from(locations)
        .where(eq(locations.name, name))
    return row.id
}

async function getOrCreateTeacher(
    tx: Parameters<Parameters<Db['transaction']>[0]>[0],
    firstName: string,
    lastName: string,
): Promise<string> {
    await tx.insert(teachers).values({ firstName, lastName }).onConflictDoNothing()
    const [row] = await tx
        .select({ id: teachers.id })
        .from(teachers)
        .where(and(eq(teachers.firstName, firstName), eq(teachers.lastName, lastName)))
    return row.id
}

async function getOrCreateStudentGroup(
    tx: Parameters<Parameters<Db['transaction']>[0]>[0],
    internalName: string,
): Promise<string> {
    await tx.insert(studentGroups).values({ internalName }).onConflictDoNothing()
    const [row] = await tx
        .select({ id: studentGroups.id })
        .from(studentGroups)
        .where(eq(studentGroups.internalName, internalName))
    return row.id
}

async function insertEventWithRelations(
    tx: Parameters<Parameters<Db['transaction']>[0]>[0],
    ev: ParsedEvent,
): Promise<void> {
    const [inserted] = await tx
        .insert(events)
        .values({ title: ev.title, startDate: ev.startDate, endDate: ev.endDate })
        .returning({ id: events.id })

    for (const room of ev.rooms) {
        const locationId = await getOrCreateLocation(tx, room.name)
        await tx.insert(eventLocations).values({ eventId: inserted.id, locationId })
    }

    for (const teacher of ev.teachers) {
        const teacherId = await getOrCreateTeacher(tx, teacher.firstName, teacher.lastName)
        await tx.insert(eventTeachers).values({ eventId: inserted.id, teacherId })
    }

    for (const group of ev.groups) {
        const studentGroupId = await getOrCreateStudentGroup(tx, group.internalName)
        await tx.insert(eventStudentGroups).values({ eventId: inserted.id, studentGroupId })
    }
}

/**
 * Applies event mutations for one week (delete removed, insert added/updated).
 * Does NOT write eventChanges — call insertAllChanges after all weeks are processed.
 */
export async function applyWeekEvents(
    db: Db,
    weekMonday: Date,
    scraped: ParsedEvent[],
): Promise<WeekDiff> {
    const weekEnd = new Date(weekMonday.getTime() + 7 * 24 * 60 * 60 * 1000)

    return db.transaction(async (tx) => {
        const existingEvents = await tx.query.events.findMany({
            where: and(gte(events.startDate, weekMonday), lt(events.startDate, weekEnd)),
            with: {
                eventLocations: { with: { location: true } },
                eventTeachers: { with: { teacher: true } },
                eventStudentGroups: { with: { studentGroup: true } },
            },
        })

        const existingByKey = new Map<string, (typeof existingEvents)[0]>()
        for (const ev of existingEvents) {
            existingByKey.set(eventKey(ev.title, ev.startDate, ev.endDate), ev)
        }

        const scrapedByKey = new Map<string, ParsedEvent>()
        for (const ev of scraped) {
            scrapedByKey.set(eventKey(ev.title, ev.startDate, ev.endDate), ev)
        }

        const toRemove: string[] = []
        const toAdd: ParsedEvent[] = []
        const toUpdate: ParsedEvent[] = []

        const diff: WeekDiff = { added: [], removed: [], updated: [] }

        for (const [key, existing] of existingByKey) {
            const scrapedEv = scrapedByKey.get(key)
            const relKey = existingRelationsKey(existing)

            if (!scrapedEv) {
                toRemove.push(existing.id)
                diff.removed.push({
                    title: existing.title,
                    startDate: existing.startDate,
                    endDate: existing.endDate,
                    relKey,
                })
            } else if (relKey !== relationsKey(scrapedEv)) {
                toRemove.push(existing.id)
                toUpdate.push(scrapedEv)
                diff.updated.push({
                    title: existing.title,
                    startDate: existing.startDate,
                    endDate: existing.endDate,
                    diff: {
                        before: {
                            rooms: existing.eventLocations.map((el) => el.location.name),
                            teachers: existing.eventTeachers.map((et) => ({
                                firstName: et.teacher.firstName,
                                lastName: et.teacher.lastName,
                            })),
                            groups: existing.eventStudentGroups.map(
                                (eg) => eg.studentGroup.internalName,
                            ),
                        },
                        after: {
                            rooms: scrapedEv.rooms.map((r) => r.name),
                            teachers: scrapedEv.teachers,
                            groups: scrapedEv.groups.map((g) => g.internalName),
                        },
                    },
                })
            }
        }

        for (const [key, scrapedEv] of scrapedByKey) {
            if (!existingByKey.has(key)) {
                toAdd.push(scrapedEv)
                diff.added.push({
                    title: scrapedEv.title,
                    startDate: scrapedEv.startDate,
                    endDate: scrapedEv.endDate,
                    relKey: relationsKey(scrapedEv),
                })
            }
        }

        if (toRemove.length > 0) {
            await tx.delete(events).where(inArray(events.id, toRemove))
        }

        for (const ev of [...toAdd, ...toUpdate]) {
            await insertEventWithRelations(tx, ev)
        }

        return diff
    })
}

/**
 * Matches added/removed slots across all week diffs, detects moves (including cross-week),
 * then inserts all eventChanges in one batch.
 */
export async function insertAllChanges(
    db: Db,
    diffs: WeekDiff[],
): Promise<{ added: number; removed: number; updated: number; moved: number }> {
    const allAdded = diffs.flatMap((d) => d.added)
    const allRemoved = diffs.flatMap((d) => d.removed)
    const allUpdated = diffs.flatMap((d) => d.updated)

    const addedByMoveKey = new Map<string, EventSlot>()
    for (const slot of allAdded) {
        addedByMoveKey.set(`${slot.title}|${slot.relKey}`, slot)
    }

    const matchedKeys = new Set<string>()
    const pendingChanges: (typeof eventChanges.$inferInsert)[] = []

    for (const change of allUpdated) {
        pendingChanges.push({
            changeType: 'updated',
            eventTitle: change.title,
            startDate: change.startDate,
            endDate: change.endDate,
            diff: change.diff,
        })
    }

    for (const removed of allRemoved) {
        const moveKey = `${removed.title}|${removed.relKey}`
        const addedSlot = addedByMoveKey.get(moveKey)
        if (addedSlot && !matchedKeys.has(moveKey)) {
            matchedKeys.add(moveKey)
            pendingChanges.push({
                changeType: 'moved',
                eventTitle: removed.title,
                startDate: removed.startDate,
                endDate: removed.endDate,
                diff: {
                    newStart: addedSlot.startDate.toISOString(),
                    newEnd: addedSlot.endDate.toISOString(),
                },
            })
        } else {
            pendingChanges.push({
                changeType: 'removed',
                eventTitle: removed.title,
                startDate: removed.startDate,
                endDate: removed.endDate,
                diff: null,
            })
        }
    }

    for (const added of allAdded) {
        if (!matchedKeys.has(`${added.title}|${added.relKey}`)) {
            pendingChanges.push({
                changeType: 'added',
                eventTitle: added.title,
                startDate: added.startDate,
                endDate: added.endDate,
                diff: null,
            })
        }
    }

    if (pendingChanges.length > 0) {
        await db.insert(eventChanges).values(pendingChanges)
    }

    const moved = matchedKeys.size
    return {
        added: allAdded.length - moved,
        removed: allRemoved.length - moved,
        updated: allUpdated.length,
        moved,
    }
}
