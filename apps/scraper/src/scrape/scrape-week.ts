import type { Page } from 'playwright'
import { applyWeekEvents, createDb, insertAllChanges } from '@studysuite/db'
import type { WeekDiff } from '@studysuite/db'
import type { ParsedEvent } from '@studysuite/shared'
import { launchBrowser } from '../browser/launch.js'
import { getAllWeekIds, gotoPlanning, gotoWeek } from '../browser/navigation.js'
import type { Config } from '../config.js'
import { computeColumnWidth } from '../extraction/column-width.js'
import { extractRawEvents } from '../extraction/planning.js'
import { readWeekDates } from '../extraction/week-dates.js'
import { parseEventText } from '../parser/event-text.js'

type Db = ReturnType<typeof createDb>

function parseWeekMonday(weekDates: string[]): Date {
    const first = weekDates[0] ?? '01/01/2000'
    const [day, month, year] = first.split('/')
    return new Date(Date.UTC(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10)))
}

async function scrapeWeek(
    page: Page,
    weekId: number,
    db: Db,
    knownGroupNames: Set<string>,
): Promise<WeekDiff> {
    await gotoWeek(page, weekId)

    const weekDates = await readWeekDates(page)
    const columnWidth = await computeColumnWidth(page)
    const rawEvents = await extractRawEvents(page)

    const parsed: ParsedEvent[] = []
    for (const { rawText, left } of rawEvents) {
        const dayIndex = Math.floor(left / columnWidth)
        const event = parseEventText(rawText, dayIndex, weekDates, knownGroupNames)
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
    durationMs: number
}> {
    const t0 = Date.now()
    const { browser, page } = await launchBrowser(config.scrape.headless, config.scrape.timeoutMs)

    try {
        await gotoPlanning(page, config.scrape.url)
        const weekIds = await getAllWeekIds(page)
        console.log(`[scraper] Found ${weekIds.length} weeks to scrape`)

        const diffs: WeekDiff[] = []
        for (const weekId of weekIds) {
            diffs.push(await scrapeWeek(page, weekId, db, knownGroupNames))
        }

        const stats = await insertAllChanges(db, diffs)
        console.log(
            `[scraper] Changes — added: ${stats.added}, removed: ${stats.removed}, updated: ${stats.updated}, moved: ${stats.moved}`,
        )

        return { ...stats, weeks: weekIds.length, durationMs: Date.now() - t0 }
    } finally {
        await browser.close()
    }
}
