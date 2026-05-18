import { createDb } from '@studysuite/db'
import { config } from './config.js'
import { runWatchLoop } from './watch/loop.js'

const db = createDb(config.databaseUrl)
const runOnce = process.argv.includes('--once')

runWatchLoop(config, db, runOnce).catch(err => {
  console.error('[scraper] Fatal error:', err)
  process.exit(1)
})
