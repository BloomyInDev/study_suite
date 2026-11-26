import { applyWeekEvents, createDb, insertAllChanges } from '@studysuite/db'
import type { WeekDiff } from '@studysuite/db'
import type { ParsedEvent } from '@studysuite/shared'
import { addParisDays, parisDayKey, parisWeekStart } from '@studysuite/shared/time'
import { toEvents } from '../ade/events.js'
import { login } from '../ade/login.js'
import { getDisplayConfigurationId, getTimetable, getWeeks } from '../ade/planning.js'
import { homeDepartment, loadResourceMap, planBatches } from '../ade/resource-map.js'
import type { Config } from '../config.js'
import { mergeBatches, type BatchEvents } from './merge.js'

/** ADE refuses a selection of more resources (`#MsgSelectionSize`). */
const MAX_SELECTION = 60

function chunk<T>(items: readonly T[], size: number): T[][] {
    const out: T[][] = []
    for (let k = 0; k < items.length; k += size) out.push(items.slice(k, k + size))
    return out
}

/**
 * The IUT's gateway answers 504 now and then under a large selection. A retry
 * a few seconds later usually goes through; three failures in a row are real.
 */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
    for (let k = 1; ; k++) {
        try {
            return await fn()
        } catch (err) {
            if (k >= attempts) throw err
            console.warn(`[scraper] ADE call failed (attempt ${k}/${attempts}), retrying:`, err)
            await new Promise((r) => setTimeout(r, 5_000 * k))
        }
    }
}

type Db = ReturnType<typeof createDb>

export interface ScrapeResult {
    added: number
    removed: number
    updated: number
    moved: number
    weeks: number
    events: number
    durationMs: number
}

export interface ScrapeOptions {
    /**
     * False: reconcile the events but write nothing to `event_changes`. For the
     * one run that first imports departments the deployment never covered,
     * whose every course would otherwise land in the changes feed as added.
     */
    recordChanges?: boolean
}

export async function scrapePlanning(
    config: Config,
    db: Db,
    { recordChanges = true }: ScrapeOptions = {},
): Promise<ScrapeResult> {
    const t0 = Date.now()
    const origin = new URL(config.scrape.url).origin
    const dataParam = config.scrape.url.split('data=')[1]?.trim()
    if (!dataParam) throw new Error('scrape.url has no ?data= parameter')

    const now = new Date()
    const from = addParisDays(now, -config.scrape.pastDays)
    const to = addParisDays(now, config.scrape.futureDays)

    const session = await login(origin, dataParam)
    console.log(`[scraper] Signed in, ${session.resources.length} resources`)
    const configId = await getDisplayConfigurationId(session)

    // The session is bound to one ADE project, an academic year, and only
    // its weeks can be fetched. Weeks of the window outside it are left alone
    // rather than reconciled against nothing.
    const first = parisWeekStart(from).getTime()
    const last = parisWeekStart(to).getTime()
    const weeks = (await getWeeks(session)).filter(
        (w) => w.monday.getTime() >= first && w.monday.getTime() <= last,
    )
    if (weeks.length === 0) {
        // Never fall through to reconciliation here: `applyWeekEvents` deletes
        // whatever a week holds that the scrape did not return.
        throw new Error('The ADE project has no week in the configured range')
    }
    console.log(
        `[scraper] ${weeks.length} weeks: ` +
            `${parisDayKey(weeks[0]!.monday)} → ${parisDayKey(weeks.at(-1)!.monday)}`,
    )

    const map = config.scrape.resourceMap ? loadResourceMap(config.scrape.resourceMap) : []
    const home = homeDepartment(session.resources, map)
    const batches = planBatches(session.resources, map, MAX_SELECTION)
    if (map.length) {
        const departments = new Set(batches.map((b) => b.department))
        console.log(
            `[scraper] ${batches.reduce((n, b) => n + b.resources.length, 0)} resources ` +
                `of ${departments.size} departments in ${batches.length} batches, home ${home}`,
        )
    }

    // Any failure throws before reconciling: a batch missing from the run
    // would read as every one of its courses being cancelled.
    const results: BatchEvents[] = []
    for (const batch of batches) {
        const events = []
        for (const slice of chunk(weeks, config.scrape.weeksPerCall)) {
            const { events: squares, columns } = await withRetry(() =>
                getTimetable(
                    { ...session, resources: batch.resources },
                    configId,
                    slice.map((w) => w.index),
                ),
            )
            const expected = slice.flatMap((w) =>
                session.days.map((d) => parisDayKey(addParisDays(w.monday, d))),
            )
            if (columns.join() !== expected.join()) {
                throw new Error(
                    `ADE drew ${columns.length} day columns, not the ${expected.length} requested`,
                )
            }
            // A resource with no course in the slice answers null, not [].
            events.push(...toEvents(squares ?? [], columns))
        }
        results.push({ department: batch.department, events })
    }

    const events = mergeBatches(results, home)
    if (events.length === 0) {
        throw new Error('ADE returned an empty timetable, refusing to reconcile')
    }

    const byWeek = new Map<number, ParsedEvent[]>()
    for (const event of events) {
        const key = parisWeekStart(event.startDate).getTime()
        const bucket = byWeek.get(key)
        if (bucket) bucket.push(event)
        else byWeek.set(key, [event])
    }

    // Every fetched week, not only the ones that came back with events: a week
    // whose classes were all cancelled still has rows to remove, and it is only
    // reconciled if `applyWeekEvents` is called for it.
    const diffs: WeekDiff[] = []
    for (const { monday } of weeks) {
        const diff = await applyWeekEvents(db, monday, byWeek.get(monday.getTime()) ?? [])
        diffs.push(diff)
        if (diff.added.length || diff.removed.length || diff.updated.length) {
            console.log(
                `[scraper]   Week ${parisDayKey(monday)}: ` +
                    `+${diff.added.length} -${diff.removed.length} ~${diff.updated.length}`,
            )
        }
    }

    // One batch, after every week: cross-week move detection needs to compare
    // removals and additions from different weeks against each other.
    const stats = recordChanges
        ? await insertAllChanges(db, diffs)
        : {
              added: diffs.reduce((n, d) => n + d.added.length, 0),
              removed: diffs.reduce((n, d) => n + d.removed.length, 0),
              updated: diffs.reduce((n, d) => n + d.updated.length, 0),
              moved: 0,
          }
    if (!recordChanges) console.log('[scraper] --no-changes: nothing written to event_changes')
    console.log(
        `[scraper] Changes: added ${stats.added}, removed ${stats.removed}, ` +
            `updated ${stats.updated}, moved ${stats.moved}`,
    )

    return {
        ...stats,
        weeks: diffs.length,
        events: events.length,
        durationMs: Date.now() - t0,
    }
}
