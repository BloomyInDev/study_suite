import type { Page } from 'playwright'
import { applyWeekEvents, createDb, insertAllChanges } from '@studysuite/db'
import type { WeekDiff } from '@studysuite/db'
import type { ParsedEvent } from '@studysuite/shared'
import { captureFailure } from '../browser/debug.js'
import { launchBrowser } from '../browser/launch.js'
import { getAllWeekIds, gotoPlanning, gotoWeek } from '../browser/navigation.js'
import type { Config } from '../config.js'
import { computeColumnWidth } from '../extraction/column-width.js'
import { extractRawEvents } from '../extraction/planning.js'
import { parseEventText } from '../parser/event-text.js'

type Db = ReturnType<typeof createDb>

function parseWeekMonday(weekDates: string[]): Date {
    // `gotoWeek` has already rejected a header that does not parse, so there is
    // no fallback here: an unreadable date used to become 01/01/2000 and target
    // a week that does not exist.
    const first = weekDates[0]
    if (!first) throw new Error('Week has no day headers')
    const [day, month, year] = first.split('/')
    return new Date(Date.UTC(parseInt(year!, 10), parseInt(month!, 10) - 1, parseInt(day!, 10)))
}

async function scrapeWeek(
    page: Page,
    weekId: number,
    db: Db,
    knownGroupNames: Set<string>,
    strictGroups: boolean,
): Promise<WeekDiff> {
    const weekDates = await gotoWeek(page, weekId)
    const columnWidth = await computeColumnWidth(page)
    const rawEvents = await extractRawEvents(page)

    const parsed: ParsedEvent[] = []
    for (const { rawText, left } of rawEvents) {
        const dayIndex = Math.floor(left / columnWidth)
        const event = parseEventText(rawText, dayIndex, weekDates, knownGroupNames, strictGroups)
        if (event) parsed.push(event)
    }

    const weekMonday = parseWeekMonday(weekDates)
    const diff = await applyWeekEvents(db, weekMonday, parsed)
    console.log(
        `[scraper]   Week ${weekDates[0] ?? '?'} — +${diff.added.length} -${diff.removed.length} ~${diff.updated.length}`,
    )
    return diff
}

export async function scrapeAllWeeks(
    config: Config,
    db: Db,
    knownGroupNames: Set<string>,
): Promise<{
    added: number
    removed: number
    updated: number
    moved: number
    weeks: number
    failedWeeks: number
    durationMs: number
}> {
    const t0 = Date.now()
    const { browser, page } = await launchBrowser(config.scrape.headless, config.scrape.timeoutMs)

    try {
        await gotoPlanning(page, config.scrape.url)
        const weekIds = await getAllWeekIds(page)
        console.log(`[scraper] Found ${weekIds.length} weeks to scrape`)

        const diffs: WeekDiff[] = []
        let failedWeeks = 0

        for (const weekId of weekIds) {
            try {
                diffs.push(
                    await scrapeWeek(page, weekId, db, knownGroupNames, config.scrape.strictGroups),
                )
            } catch (err) {
                // A week that did not render is skipped, never applied. Handing
                // its empty extraction to `applyWeekEvents` deletes every event
                // of the week and the next run puts them back: a day vanishing
                // from the app for one interval, and a burst of bogus
                // removed/moved rows in the changes feed.
                failedWeeks++
                console.error(
                    `[scraper]   Skipped week id ${weekId}:`,
                    err instanceof Error ? err.message : err,
                )
                await captureFailure(page, config.scrape.debugDir)
            }
        }

        // Only the weeks that rendered. A course moved out of a skipped week
        // therefore shows up as a lone `added` this run and a lone `removed`
        // the next, rather than as a `moved`. That is the cost of not guessing.
        const stats = await insertAllChanges(db, diffs)
        console.log(
            `[scraper] Changes — added: ${stats.added}, removed: ${stats.removed}, updated: ${stats.updated}, moved: ${stats.moved}`,
        )

        return {
            ...stats,
            weeks: weekIds.length - failedWeeks,
            failedWeeks,
            durationMs: Date.now() - t0,
        }
    } catch (err) {
        // Screenshot while the page is still alive — finally closes the browser.
        await captureFailure(page, config.scrape.debugDir)
        throw err
    } finally {
        await browser.close()
    }
}
