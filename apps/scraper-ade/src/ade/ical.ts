import type { AdeSession } from './login.js'

/**
 * ADE's iCalendar export servlet, the whole reason this scraper needs no
 * browser. It takes plain dates and returns RFC 5545 for any range, so one
 * request covers the academic year that used to take 59 page navigations.
 */

/** ADE projects are numbered from 1; the install we read has never gone past 9. */
const MAX_PROJECT_ID = 20

const ymd = (d: Date): string => d.toISOString().slice(0, 10)

export async function fetchIcal(
    origin: string,
    session: AdeSession,
    projectId: number,
    from: Date,
    to: Date,
): Promise<string | null> {
    const url =
        `${origin}/jsp/custom/modules/plannings/direct_cal.jsp` +
        `?projectId=${projectId}&identifier=${session.identifier}` +
        `&resources=${session.resources}&calType=ical` +
        `&firstDate=${ymd(from)}&lastDate=${ymd(to)}`

    const res = await fetch(url, { headers: { Cookie: session.cookie } })
    const text = await res.text()
    // An invalid project answers 200 with an error page, not a status code.
    return text.includes('BEGIN:VCALENDAR') ? text : null
}

const countEvents = (ics: string): number => (ics.match(/BEGIN:VEVENT/g) ?? []).length

/**
 * Which ADE project holds the timetable for `from`..`to`.
 *
 * A project is an **academic year**, not a deployment: this install carries 6
 * (2023-24) through 9 (2026-27), and a new one appears every September. Pinning
 * the number in configuration therefore goes blind at the rollover, still
 * serving last year's planning, so it is resolved per run instead.
 *
 * Picking the *first* project with any events, which is what the reference
 * implementation does, only works while the requested range excludes past
 * years: a window spanning two academic years matches the older project first
 * and sticks to it. Taking the busiest project in the window, highest id
 * winning ties, rolls over on its own and tolerates next year's skeleton
 * project appearing early.
 */
export async function resolveProjectId(
    origin: string,
    session: AdeSession,
    from: Date,
    to: Date,
): Promise<number | null> {
    let best: { id: number; events: number } | null = null

    for (let id = 1; id <= MAX_PROJECT_ID; id++) {
        const ics = await fetchIcal(origin, session, id, from, to)
        if (!ics) continue
        const events = countEvents(ics)
        if (events === 0) continue
        if (!best || events > best.events || (events === best.events && id > best.id)) {
            best = { id, events }
        }
    }

    return best?.id ?? null
}
