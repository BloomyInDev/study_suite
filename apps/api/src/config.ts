import { z } from 'zod'
import { loadConfig, zInt } from '@studysuite/shared/config'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const schema = z.object({
  server: z.object({
    port: zInt.positive().default(3000),
    corsOrigin: z.string().default('http://localhost:5173'),
    frontendUrl: z.string().default('http://localhost:5173'),
  }),
  database: z.object({
    url: z.string().min(1),
  }),
  discord: z.object({
    clientId: z.string().min(1),
    clientSecret: z.string().min(1),
    guildId: z.string().min(1),
    redirectUri: z.string().default('http://localhost:3000/auth/discord/callback'),
  }),
  jwt: z.object({
    secret: z.string().min(32),
  }),
})

export const config = loadConfig({
  schema,
  yamlPath: resolve(dirname(fileURLToPath(import.meta.url)), '..', 'config.yaml'),
  envMap: {
    PORT: 'server.port',
    DATABASE_URL: 'database.url',
    CORS_ORIGIN: 'server.corsOrigin',
    FRONTEND_URL: 'server.frontendUrl',
    DISCORD_CLIENT_ID: 'discord.clientId',
    DISCORD_CLIENT_SECRET: 'discord.clientSecret',
    DISCORD_GUILD_ID: 'discord.guildId',
    DISCORD_REDIRECT_URI: 'discord.redirectUri',
    JWT_SECRET: 'jwt.secret',
  },
})

export type Config = z.infer<typeof schema>
