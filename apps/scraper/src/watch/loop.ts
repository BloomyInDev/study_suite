import { createDb, studentGroups } from '@studysuite/db'
import type { Config } from '../config.js'
import { scrapeCurrentWeek } from '../scrape/scrape-week.js'

type Db = ReturnType<typeof createDb>

async function loadKnownGroupNames(db: Db): Promise<Set<string>> {
  const rows = await db.select({ internalName: studentGroups.internalName }).from(studentGroups)
  return new Set(rows.map(r => r.internalName))
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function runWatchLoop(config: Config, db: Db): Promise<void> {
  process.on('SIGINT', () => {
    console.log('\n[scraper] Shutting down')
    process.exit(0)
  })

  while (true) {
    const knownGroupNames = await loadKnownGroupNames(db)
    console.log(`[scraper] Starting scrape at ${new Date().toISOString()}`)

    try {
      const result = await scrapeCurrentWeek(config, db, knownGroupNames)
      console.log(
        `[scraper] Done — added: ${result.added}, removed: ${result.removed}, ` +
          `updated: ${result.updated}, duration: ${result.durationMs}ms`,
      )
    } catch (err) {
      console.error('[scraper] Error during scrape:', err)
    }

    if (config.runOnce) break

    console.log(`[scraper] Next run in ${config.intervalMs / 1000}s`)
    await sleep(config.intervalMs)
  }
}
