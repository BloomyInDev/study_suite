import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { launchBrowser } from './browser/launch.js'
import { gotoPlanning, gotoWeek } from './browser/navigation.js'
import { computeColumnWidth } from './extraction/column-width.js'
import { extractRawEvents } from './extraction/planning.js'
import { readWeekDates } from './extraction/week-dates.js'
import { parseEventText } from './parser/event-text.js'

const url = process.env.PROSECONSULT_URL
if (!url) throw new Error('PROSECONSULT_URL is required')

const headless = process.env.HEADLESS !== 'false'
const outPath = path.resolve(process.cwd(), 'dump.json')

const { browser, page } = await launchBrowser(headless)

try {
  await gotoPlanning(page, url)

  // Collect all week button IDs — filter out navigation arrows by checking button text
  const weekIds = await page.evaluate(() => {
    const container = document.querySelector('#x-auto-26')
    if (!container) throw new Error('#x-auto-26 not found')
    return Array.from(container.children)
      .filter(el => /^S\d+/.test(el.querySelector('button')?.textContent?.trim() ?? ''))
      .map(el => parseInt(el.id.replace('x-auto-', ''), 10))
      .filter(n => !isNaN(n))
  })

  console.log(`[dump] ${weekIds.length} weeks to scrape`)

  const weeks: unknown[] = []

  for (let i = 0; i < weekIds.length; i++) {
    const weekId = weekIds[i]!
    await gotoWeek(page, weekId)
    await page.waitForSelector('div#Planning')
    await page.waitForLoadState('networkidle')

    const weekDates = await readWeekDates(page)
    const columnWidth = await computeColumnWidth(page)
    const rawEvents = await extractRawEvents(page)

    const events = rawEvents.map(({ rawText, left }) => {
      const dayIndex = Math.floor(left / columnWidth)
      const parsed = parseEventText(rawText, dayIndex, weekDates, new Set())
      return { date: weekDates[dayIndex] ?? null, parsed }
    })

    weeks.push({ weekId, weekDates, events })

    console.log(`[dump] ${i + 1}/${weekIds.length} — week ${weekId} (${weekDates[0] ?? '?'}) — ${rawEvents.length} events`)
  }

  const output = JSON.stringify({ scrapedAt: new Date().toISOString(), url, weeks }, null, 2)
  await writeFile(outPath, output, 'utf-8')
  console.log(`[dump] written to ${outPath}`)
} finally {
  await browser.close()
}
