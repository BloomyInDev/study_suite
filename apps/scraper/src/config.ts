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
        /** Per-action cap for page loads and selector waits. */
        timeoutMs: zInt.positive().default(60_000),
        /** Where failure screenshots are written. */
        debugDir: z.string().default('./debug'),
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
        SCRAPE_TIMEOUT_MS: 'scrape.timeoutMs',
        SCRAPE_DEBUG_DIR: 'scrape.debugDir',
    },
})

export type Config = z.infer<typeof schema>
