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

function eventKey(title: string, start: Date, end: Date): string {
  return `${title}|${start.toISOString()}|${end.toISOString()}`
}

function relationsKey(ev: ParsedEvent): string {
  const rooms = ev.rooms.map(r => r.name).sort().join(',')
  const tchrs = ev.teachers.map(t => `${t.lastName}:${t.firstName}`).sort().join(',')
  const groups = ev.groups.map(g => g.internalName).sort().join(',')
  return `${rooms}|${tchrs}|${groups}`
}

async function getOrCreateLocation(
  tx: Parameters<Parameters<Db['transaction']>[0]>[0],
  name: string,
): Promise<string> {
  await tx.insert(locations).values({ name }).onConflictDoNothing()
  const [row] = await tx.select({ id: locations.id }).from(locations).where(eq(locations.name, name))
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

export async function reconcileWeek(
  db: Db,
  weekMonday: Date,
  scraped: ParsedEvent[],
): Promise<{ added: number; removed: number; updated: number }> {
  const weekEnd = new Date(weekMonday.getTime() + 7 * 24 * 60 * 60 * 1000)

  return db.transaction(async tx => {
    // Load existing events for this week with their relations
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

    for (const [key, existing] of existingByKey) {
      const scrapedEv = scrapedByKey.get(key)
      if (!scrapedEv) {
        toRemove.push(existing.id)
        await tx.insert(eventChanges).values({
          changeType: 'removed',
          eventTitle: existing.title,
          startDate: existing.startDate,
          endDate: existing.endDate,
          diff: null,
        })
      } else {
        const existingRelKey = [
          existing.eventLocations.map(el => el.location.name).sort().join(','),
          existing.eventTeachers
            .map(et => `${et.teacher.lastName}:${et.teacher.firstName}`)
            .sort()
            .join(','),
          existing.eventStudentGroups.map(eg => eg.studentGroup.internalName).sort().join(','),
        ].join('|')

        if (existingRelKey !== relationsKey(scrapedEv)) {
          toRemove.push(existing.id)
          toUpdate.push(scrapedEv)
          await tx.insert(eventChanges).values({
            changeType: 'updated',
            eventTitle: existing.title,
            startDate: existing.startDate,
            endDate: existing.endDate,
            diff: {
              before: {
                rooms: existing.eventLocations.map(el => el.location.name),
                teachers: existing.eventTeachers.map(et => ({
                  firstName: et.teacher.firstName,
                  lastName: et.teacher.lastName,
                })),
                groups: existing.eventStudentGroups.map(eg => eg.studentGroup.internalName),
              },
              after: {
                rooms: scrapedEv.rooms.map(r => r.name),
                teachers: scrapedEv.teachers,
                groups: scrapedEv.groups.map(g => g.internalName),
              },
            },
          })
        }
      }
    }

    for (const [key, scrapedEv] of scrapedByKey) {
      if (!existingByKey.has(key)) {
        toAdd.push(scrapedEv)
        await tx.insert(eventChanges).values({
          changeType: 'added',
          eventTitle: scrapedEv.title,
          startDate: scrapedEv.startDate,
          endDate: scrapedEv.endDate,
          diff: null,
        })
      }
    }

    if (toRemove.length > 0) {
      await tx.delete(events).where(inArray(events.id, toRemove))
    }

    for (const ev of [...toAdd, ...toUpdate]) {
      await insertEventWithRelations(tx, ev)
    }

    return { added: toAdd.length, removed: toRemove.length - toUpdate.length, updated: toUpdate.length }
  })
}
