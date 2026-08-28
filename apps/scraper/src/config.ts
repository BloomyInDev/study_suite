import { z } from 'zod'
import { loadConfig, zBool, zInt } from '@studysuite/shared/config'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const schema = z.object({
    database: z.object({
        url: z.string().min(1),
    }),
    scrape: z.object({
        url: z.string().url(),
        headless: zBool.default(true),
        intervalMs: zInt.positive().default(1_800_000),
    }),
})

export const config = loadConfig({
    schema,
    // CONFIG_PATH lets the deployment point at a file mounted next to compose.yml.
    yamlPath:
        process.env.CONFIG_PATH ??
        resolve(dirname(fileURLToPath(import.meta.url)), '..', 'config.yaml'),
    envMap: {
        DATABASE_URL: 'database.url',
        PROSECONSULT_URL: 'scrape.url',
        HEADLESS: 'scrape.headless',
        SCRAPE_INTERVAL_MS: 'scrape.intervalMs',
    },
})

export type Config = z.infer<typeof schema>
