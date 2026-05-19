import { createDb } from '@studysuite/db'
import { config } from './config.js'

export type Db = ReturnType<typeof createDb>
export const db: Db = createDb(config.database.url)
