import { createDb } from '@studysuite/db'
import { config } from './config.js'
import { requestScrape, runWatchLoop } from './watch/loop.js'
import { startTriggerServer } from './watch/trigger.js'

const db = createDb(config.database.url)
const runOnce = process.argv.includes('--once')

if (config.scrape.triggerPort && !runOnce) {
    startTriggerServer(config.scrape.triggerPort, requestScrape)
}

runWatchLoop(config, db, runOnce)
    .then(async () => {
        // A --once run does not exit on its own: the postgres connection holds
        // the event loop open. Everything is committed by now, so close the
        // pool and exit.
        if (runOnce) {
            await db.$client.end()
            process.exit(process.exitCode ?? 0)
        }
    })
    .catch((err) => {
        console.error('[scraper] Fatal error:', err)
        process.exit(1)
    })
