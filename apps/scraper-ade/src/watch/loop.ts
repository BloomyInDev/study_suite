import { createDb } from '@studysuite/db'
import type { Config } from '../config.js'
import { scrapePlanning } from '../scrape/scrape-planning.js'

type Db = ReturnType<typeof createDb>

// Set while the loop waits for its next run; calling it ends the wait early.
let wake: (() => void) | null = null
// A trigger that lands mid-run is remembered, so the run after it is not lost.
let requested = false

/** Brings the next run forward, or queues one right after the current run. */
export function requestScrape(): void {
    requested = true
    wake?.()
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        const timer = setTimeout(done, ms)
        function done() {
            clearTimeout(timer)
            wake = null
            resolve()
        }
        wake = done
    })
}

export async function runWatchLoop(config: Config, db: Db, runOnce = false): Promise<void> {
    process.on('SIGINT', () => {
        console.log('\n[scraper] Shutting down')
        process.exit(0)
    })

    while (true) {
        requested = false
        console.log(`[scraper] Starting scrape at ${new Date().toISOString()}`)

        try {
            const result = await scrapePlanning(config, db)
            console.log(
                `[scraper] Done: ${result.events} events over ${result.weeks} weeks, ` +
                    `added ${result.added}, removed ${result.removed}, ` +
                    `updated ${result.updated}, moved ${result.moved}, ` +
                    `duration ${result.durationMs}ms`,
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
        if (requested) continue

        console.log(`[scraper] Next run in ${config.scrape.intervalMs / 1000}s`)
        await sleep(config.scrape.intervalMs)
    }
}
