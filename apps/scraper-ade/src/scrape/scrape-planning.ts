import { applyWeekEvents, createDb, insertAllChanges } from '@studysuite/db'
import type { WeekDiff } from '@studysuite/db'
import type { ParsedEvent } from '@studysuite/shared'
import { wallClockNow } from '@studysuite/shared/time'
import { fetchIcal, resolveProjectId } from '../ade/ical.js'
import { login } from '../ade/login.js'
import { parseCalendar } from '../ade/parse.js'
import type { Config } from '../config.js'

type Db = ReturnType<typeof createDb>

const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS

/**
 * The Monday opening the week a wall-clock label falls in.
 *
 * UTC getters throughout: the label already *is* the Paris day, so reading it
 * any other way would shift the week boundary by the offset.
 */
function weekMonday(label: Date): Date {
    const d = new Date(Date.UTC(label.getUTCFullYear(), label.getUTCMonth(), label.getUTCDate()))
    // getUTCDay: 0 = Sunday, so map it to 6 to make Monday the origin.
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
    return d
}

export interface ScrapeResult {
    added: number
    removed: number
    updated: number
    moved: number
    weeks: number
    events: number
    projectId: number
    durationMs: number
}

export async function scrapePlanning(config: Config, db: Db): Promise<ScrapeResult> {
    const t0 = Date.now()
    const origin = new URL(config.scrape.url).origin
    const dataParam = config.scrape.url.split('data=')[1]?.trim()
    if (!dataParam) throw new Error('scrape.url has no ?data= parameter')

    const now = wallClockNow()
    const from = new Date(now.getTime() - config.scrape.pastDays * DAY_MS)
    const to = new Date(now.getTime() + config.scrape.futureDays * DAY_MS)

    const session = await login(origin, dataParam)
    console.log(`[scraper] Signed in, ${session.resources.split(',').length} resources`)

    const projectId = config.scrape.projectId ?? (await resolveProjectId(origin, session, from, to))
    if (projectId === null) {
        // Never fall through to reconciliation here. `applyWeekEvents` deletes
        // whatever a week holds that the scrape did not return, so treating
        // "no project" as "no events" would empty the whole planning.
        throw new Error('No ADE project holds events for the configured range')
    }
    console.log(
        `[scraper] Project ${projectId}${config.scrape.projectId ? ' (pinned)' : ''}: ` +
            `${from.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)}`,
    )

    const ics = await fetchIcal(origin, session, projectId, from, to)
    if (!ics) throw new Error(`ADE returned no calendar for project ${projectId}`)

    const events = parseCalendar(ics)
    if (events.length === 0) {
        throw new Error('ADE returned an empty calendar, refusing to reconcile')
    }

    const byWeek = new Map<number, ParsedEvent[]>()
    for (const event of events) {
        const key = weekMonday(event.startDate).getTime()
        const bucket = byWeek.get(key)
        if (bucket) bucket.push(event)
        else byWeek.set(key, [event])
    }

    // Every week in the range, not only the ones that came back with events: a
    // week whose classes were all cancelled still has rows to remove, and it is
    // only reconciled if `applyWeekEvents` is called for it.
    const diffs: WeekDiff[] = []
    const lastMonday = weekMonday(to).getTime()
    for (let monday = weekMonday(from).getTime(); monday <= lastMonday; monday += WEEK_MS) {
        const scraped = byWeek.get(monday) ?? []
        const diff = await applyWeekEvents(db, new Date(monday), scraped)
        diffs.push(diff)
        if (diff.added.length || diff.removed.length || diff.updated.length) {
            console.log(
                `[scraper]   Week ${new Date(monday).toISOString().slice(0, 10)}: ` +
                    `+${diff.added.length} -${diff.removed.length} ~${diff.updated.length}`,
            )
        }
    }

    // One batch, after every week: cross-week move detection needs to compare
    // removals and additions from different weeks against each other.
    const stats = await insertAllChanges(db, diffs)
    console.log(
        `[scraper] Changes: added ${stats.added}, removed ${stats.removed}, ` +
            `updated ${stats.updated}, moved ${stats.moved}`,
    )

    return {
        ...stats,
        weeks: diffs.length,
        events: events.length,
        projectId,
        durationMs: Date.now() - t0,
    }
}
