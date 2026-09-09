import type { ReminderPayload } from './push.js'

/**
 * Deciding *which* course is due a reminder, kept free of the database and the
 * config so it can be tested on plain objects — the window arithmetic and the
 * wall-clock formatting below are where this feature gets silently wrong.
 */

/** The subscription fields the matching actually reads. */
export interface Subscriber {
    id: string
    groupIds: string[]
    leadMinutes: number
}

/** The event fields it reads, in the shape `withEventRelations` returns. */
export interface UpcomingEvent {
    id: string
    title: string
    /** A Paris wall-clock label — see the Time section of AGENTS.md. */
    startDate: Date
    eventLocations: { location: { name: string } }[]
    eventTeachers: { teacher: { firstName: string; lastName: string } }[]
    eventStudentGroups: { studentGroup: { id: string } }[]
}

/**
 * `startDate` is a label, not an instant, so the hour a student reads comes out
 * of the UTC getters. Formatting it in Europe/Paris would apply the offset a
 * second time and show a course at 12h00 that the planning shows at 10h00.
 */
export function formatHour(wallClock: Date): string {
    return wallClock.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'UTC',
    })
}

/**
 * `now` must be `wallClockNow()`. Both sides being labels, the Paris offset
 * cancels in the subtraction and the minute count is right in either season.
 */
export function buildPayload(event: UpcomingEvent, now: Date): ReminderPayload {
    const minutes = Math.max(0, Math.round((event.startDate.getTime() - now.getTime()) / 60000))
    const rooms = event.eventLocations.map((el) => el.location.name)
    const teachers = event.eventTeachers.map(
        (et) => `${et.teacher.lastName} ${et.teacher.firstName}`,
    )

    return {
        title: event.title,
        body: [
            minutes < 1 ? 'Maintenant' : `Dans ${minutes} min`,
            formatHour(event.startDate),
            ...rooms,
            ...teachers,
        ].join(' · '),
        eventId: event.id,
        url: '/',
    }
}

/**
 * Every (subscriber, event) pair whose reminder time has arrived.
 *
 * The condition is one-sided on purpose: it never fires early, and once the
 * reminder point has passed it stays true until the course starts. A tick the
 * api missed — a restart, a slow query, a deploy — is therefore picked up by
 * the next one instead of being lost, and the caller's claim table stops the
 * repeat that would otherwise cause.
 */
export function duePairs<S extends Subscriber, E extends UpcomingEvent>(
    subscribers: S[],
    upcoming: E[],
    now: Date,
): { sub: S; event: E }[] {
    const pairs: { sub: S; event: E }[] = []

    for (const sub of subscribers) {
        // A visitor who has not picked a group yet is subscribed to nothing.
        if (sub.groupIds.length === 0) continue
        const groups = new Set(sub.groupIds)
        const lead = sub.leadMinutes * 60_000

        for (const event of upcoming) {
            if (event.startDate.getTime() <= now.getTime()) continue
            if (event.startDate.getTime() - now.getTime() > lead) continue
            if (!event.eventStudentGroups.some((g) => groups.has(g.studentGroup.id))) continue
            pairs.push({ sub, event })
        }
    }

    return pairs
}
