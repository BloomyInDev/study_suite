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
    /** Internal names of the groups concerned, kept for the changes feed. */
    groups: string[]
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

/** An events row with the relations reconciliation needs, as loaded below. */
interface ExistingEvent {
    id: string
    title: string
    startDate: Date
    endDate: Date
    eventLocations: Array<{ location: { name: string } }>
    eventTeachers: Array<{ teacher: { firstName: string; lastName: string } }>
    eventStudentGroups: Array<{ studentGroup: { internalName: string } }>
}

function existingRelationsKey(existing: ExistingEvent): string {
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

/** The three name sets a match is scored on, in one shape for both sides. */
interface Relations {
    rooms: string[]
    teachers: string[]
    groups: string[]
}

function scrapedRelations(ev: ParsedEvent): Relations {
    return {
        rooms: ev.rooms.map((r) => r.name),
        teachers: ev.teachers.map((t) => `${t.lastName}:${t.firstName}`),
        groups: ev.groups.map((g) => g.internalName),
    }
}

function existingRelations(existing: ExistingEvent): Relations {
    return {
        rooms: existing.eventLocations.map((el) => el.location.name),
        teachers: existing.eventTeachers.map(
            (et) => `${et.teacher.lastName}:${et.teacher.firstName}`,
        ),
        groups: existing.eventStudentGroups.map((eg) => eg.studentGroup.internalName),
    }
}

const sharedCount = (a: string[], b: string[]): number => {
    const set = new Set(b)
    return a.filter((name) => set.has(name)).length
}

/**
 * How likely two events in the same slot are the same event with something
 * changed. The audience decides first — a room swap is routine, but two
 * "Réunion de rentrée BUT2" for Q-Sète and Q1..Q4 are different meetings.
 */
function matchScore(a: Relations, b: Relations): number {
    return (
        sharedCount(a.groups, b.groups) * 100 +
        sharedCount(a.teachers, b.teachers) * 10 +
        sharedCount(a.rooms, b.rooms)
    )
}

/**
 * Pairs the events a slot holds on both sides. Identical relations pair off
 * first, then the leftovers greedily by best score — whatever is left over is
 * a genuine removal or addition.
 */
function matchSlot(
    existing: ExistingEvent[],
    scraped: ParsedEvent[],
): {
    updated: { existing: ExistingEvent; scraped: ParsedEvent }[]
    removed: ExistingEvent[]
    added: ParsedEvent[]
} {
    const remainingExisting = [...existing]
    const remainingScraped = [...scraped]

    // Untouched events: same slot, same relations. They pair off and are left alone.
    for (let i = remainingExisting.length - 1; i >= 0; i--) {
        const relKey = existingRelationsKey(remainingExisting[i]!)
        const match = remainingScraped.findIndex((ev) => relationsKey(ev) === relKey)
        if (match !== -1) {
            remainingExisting.splice(i, 1)
            remainingScraped.splice(match, 1)
        }
    }

    const updated: { existing: ExistingEvent; scraped: ParsedEvent }[] = []
    while (remainingExisting.length > 0 && remainingScraped.length > 0) {
        let best = { score: -1, existingIdx: 0, scrapedIdx: 0 }
        remainingExisting.forEach((ex, existingIdx) => {
            const exRel = existingRelations(ex)
            remainingScraped.forEach((ev, scrapedIdx) => {
                const score = matchScore(exRel, scrapedRelations(ev))
                if (score > best.score) best = { score, existingIdx, scrapedIdx }
            })
        })
        updated.push({
            existing: remainingExisting.splice(best.existingIdx, 1)[0]!,
            scraped: remainingScraped.splice(best.scrapedIdx, 1)[0]!,
        })
    }

    return { updated, removed: remainingExisting, added: remainingScraped }
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

        // A slot holds as many events as the planning shows in it: the same
        // meeting runs in Montpellier and in Sète, same title, same hour. Keyed
        // on the slot alone, one silently overwrote the other and never reached
        // the database — hence the bucket per slot.
        const existingBySlot = new Map<string, ExistingEvent[]>()
        for (const ev of existingEvents) {
            const key = eventKey(ev.title, ev.startDate, ev.endDate)
            existingBySlot.set(key, [...(existingBySlot.get(key) ?? []), ev])
        }

        const scrapedBySlot = new Map<string, ParsedEvent[]>()
        for (const ev of scraped) {
            const key = eventKey(ev.title, ev.startDate, ev.endDate)
            scrapedBySlot.set(key, [...(scrapedBySlot.get(key) ?? []), ev])
        }

        const toRemove: string[] = []
        const toAdd: ParsedEvent[] = []
        const toUpdate: ParsedEvent[] = []

        const diff: WeekDiff = { added: [], removed: [], updated: [] }

        for (const key of new Set([...existingBySlot.keys(), ...scrapedBySlot.keys()])) {
            const slot = matchSlot(existingBySlot.get(key) ?? [], scrapedBySlot.get(key) ?? [])

            for (const { existing, scraped: scrapedEv } of slot.updated) {
                toRemove.push(existing.id)
                toUpdate.push(scrapedEv)
                const before = existingRelations(existing)
                diff.updated.push({
                    title: existing.title,
                    startDate: existing.startDate,
                    endDate: existing.endDate,
                    diff: {
                        before: {
                            rooms: before.rooms,
                            teachers: existing.eventTeachers.map((et) => ({
                                firstName: et.teacher.firstName,
                                lastName: et.teacher.lastName,
                            })),
                            groups: before.groups,
                        },
                        after: {
                            rooms: scrapedEv.rooms.map((r) => r.name),
                            teachers: scrapedEv.teachers,
                            groups: scrapedEv.groups.map((g) => g.internalName),
                        },
                    },
                })
            }

            for (const existing of slot.removed) {
                toRemove.push(existing.id)
                diff.removed.push({
                    title: existing.title,
                    startDate: existing.startDate,
                    endDate: existing.endDate,
                    relKey: existingRelationsKey(existing),
                    groups: existingRelations(existing).groups,
                })
            }

            for (const scrapedEv of slot.added) {
                toAdd.push(scrapedEv)
                diff.added.push({
                    title: scrapedEv.title,
                    startDate: scrapedEv.startDate,
                    endDate: scrapedEv.endDate,
                    relKey: relationsKey(scrapedEv),
                    groups: scrapedEv.groups.map((g) => g.internalName),
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
            // Both sides: a group losing the course still wants to hear about it.
            groups: [...new Set([...change.diff.before.groups, ...change.diff.after.groups])],
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
                groups: removed.groups,
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
                groups: removed.groups,
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
                groups: added.groups,
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
