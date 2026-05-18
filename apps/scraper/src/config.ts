import { z } from 'zod'
import { loadConfig, zBool, zInt } from '@studysuite/shared/config'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const schema = z.object({
  proseconsultUrl: z.string().url(),
  databaseUrl: z.string().min(1),
  headless: zBool.default(true),
  intervalMs: zInt.positive().default(1_800_000),
})

export const config = loadConfig({
  schema,
  yamlPath: resolve(dirname(fileURLToPath(import.meta.url)), '..', 'config.yaml'),
  envMap: {
    PROSECONSULT_URL: 'proseconsultUrl',
    DATABASE_URL: 'databaseUrl',
    HEADLESS: 'headless',
    SCRAPE_INTERVAL_MS: 'intervalMs',
  },
})

export type Config = z.infer<typeof schema>
