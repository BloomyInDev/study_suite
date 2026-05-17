import { createDb } from '@studysuite/db'
import { loadConfig } from './config.js'
import { runWatchLoop } from './watch/loop.js'

const config = loadConfig()
const db = createDb(config.databaseUrl)

runWatchLoop(config, db).catch(err => {
  console.error('[scraper] Fatal error:', err)
  process.exit(1)
})
