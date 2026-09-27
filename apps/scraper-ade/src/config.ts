import { z } from 'zod'
import { loadConfig, zInt } from '@studysuite/shared/config'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const schema = z.object({
    database: z.object({
        url: z.string().min(1),
    }),
    scrape: z.object({
        url: z.string().url(),
        intervalMs: zInt.positive().default(1_800_000),
        /** How far back to reconcile, in days. */
        pastDays: zInt.positive().default(30),
        /** How far ahead. The planning is usually published a year out. */
        futureDays: zInt.positive().default(365),
        /**
         * Port for `POST /scrape`, which runs a scrape now. Unset: no server.
         * Unauthenticated, so only for a private network (see watch/trigger.ts).
         */
        triggerPort: zInt.positive().optional(),
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
        SCRAPE_INTERVAL_MS: 'scrape.intervalMs',
        SCRAPE_PAST_DAYS: 'scrape.pastDays',
        SCRAPE_FUTURE_DAYS: 'scrape.futureDays',
        SCRAPE_TRIGGER_PORT: 'scrape.triggerPort',
    },
})

export type Config = z.infer<typeof schema>
