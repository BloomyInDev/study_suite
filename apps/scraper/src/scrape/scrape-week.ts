import { createDb, reconcileWeek } from '@studysuite/db'
import type { ParsedEvent } from '@studysuite/shared'
import { launchBrowser } from '../browser/launch.js'
import { gotoPlanning } from '../browser/navigation.js'
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

export async function scrapeCurrentWeek(
  config: Config,
  db: Db,
  knownGroupNames: Set<string>,
): Promise<{ added: number; removed: number; updated: number; durationMs: number }> {
  const t0 = Date.now()
  const { browser, page } = await launchBrowser(config.headless)

  try {
    await gotoPlanning(page, config.proseconsultUrl)

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
    const stats = await reconcileWeek(db, weekMonday, parsed)

    return { ...stats, durationMs: Date.now() - t0 }
  } finally {
    await browser.close()
  }
}
