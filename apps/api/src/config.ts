import { z } from 'zod'
import { loadConfig, zInt } from '@studysuite/shared/config'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const schema = z.object({
  server: z.object({
    port: zInt.positive().default(3000),
    corsOrigin: z.string().default('http://localhost:5173'),
  }),
  database: z.object({
    url: z.string().min(1),
  }),
})

export const config = loadConfig({
  schema,
  yamlPath: resolve(dirname(fileURLToPath(import.meta.url)), '..', 'config.yaml'),
  envMap: {
    PORT: 'server.port',
    DATABASE_URL: 'database.url',
    CORS_ORIGIN: 'server.corsOrigin',
  },
})

export type Config = z.infer<typeof schema>
