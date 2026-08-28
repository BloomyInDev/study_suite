import { createDb } from '@studysuite/db'
import { config } from './config.js'
import { runWatchLoop } from './watch/loop.js'

const db = createDb(config.database.url)
const runOnce = process.argv.includes('--once')

runWatchLoop(config, db, runOnce)
    .then(async () => {
        // The postgres connection holds the event loop open, so a --once run
        // would never exit on its own.
        if (runOnce) await db.$client.end()
    })
    .catch((err) => {
        console.error('[scraper] Fatal error:', err)
        process.exit(1)
    })
