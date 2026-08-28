import { createDb, studentGroups } from '@studysuite/db'
import type { Config } from '../config.js'
import { scrapeAllWeeks } from '../scrape/scrape-week.js'

type Db = ReturnType<typeof createDb>

async function loadKnownGroupNames(db: Db): Promise<Set<string>> {
    const rows = await db.select({ internalName: studentGroups.internalName }).from(studentGroups)
    return new Set(rows.map((r) => r.internalName))
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function runWatchLoop(config: Config, db: Db, runOnce = false): Promise<void> {
    process.on('SIGINT', () => {
        console.log('\n[scraper] Shutting down')
        process.exit(0)
    })

    while (true) {
        const knownGroupNames = await loadKnownGroupNames(db)
        console.log(`[scraper] Starting scrape at ${new Date().toISOString()}`)

        try {
            const result = await scrapeAllWeeks(config, db, knownGroupNames)
            console.log(
                `[scraper] Done — ${result.weeks} weeks, added: ${result.added}, removed: ${result.removed}, ` +
                    `updated: ${result.updated}, moved: ${result.moved}, duration: ${result.durationMs}ms`,
            )
        } catch (err) {
            console.error('[scraper] Error during scrape:', err)
            // A one-shot run is a manual/CI check: surface the failure.
            if (runOnce) {
                process.exitCode = 1
                break
            }
        }

        if (runOnce) break

        console.log(`[scraper] Next run in ${config.scrape.intervalMs / 1000}s`)
        await sleep(config.scrape.intervalMs)
    }
}
