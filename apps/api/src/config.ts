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
    discord: z.object({
        clientId: z.string().min(1),
        clientSecret: z.string().min(1),
        redirectUri: z.string().default('http://localhost:3000/api/auth/discord/callback'),
    }),
    /**
     * The department's LDAP↔OIDC bridge. Optional: the api boots without it and
     * the /auth/iut routes answer 503 until it is configured.
     */
    iut: z
        .object({
            /** What the login button and the admin pages call it. */
            displayName: z.string().min(1).default('IUT'),
            issuerUrl: z.string().url(),
            clientId: z.string().min(1),
            clientSecret: z.string().min(1),
            redirectUri: z.string().default('http://localhost:3000/api/auth/iut/callback'),
        })
        .optional(),
    jwt: z.object({
        secret: z.string().min(32),
    }),
    /**
     * Web Push (VAPID). Optional, like `iut`: leave the block out and the
     * /api/push routes answer 503, the reminder tick never starts, and
     * `GET /api/config` tells the frontend not to offer the toggle.
     *
     * Generate a keypair with:
     *   pnpm -F @studysuite/api exec web-push generate-vapid-keys
     *
     * The pair is an identity, not a secret to rotate casually: every existing
     * subscription is bound to the public key it was created with, so changing
     * it silently stops delivery to every browser already subscribed.
     */
    push: z
        .object({
            publicKey: z.string().min(1),
            privateKey: z.string().min(1),
            /** RFC 8292 contact the push service can reach you at. */
            subject: z.string().regex(/^(mailto:|https:)/, 'must be a mailto: or https: URI'),
        })
        // `nullish`, not `optional`: a config.yaml copied from the example has
        // `push:` present with every key commented out, which YAML parses as
        // null — and `.optional()` rejects null, so the api would refuse to
        // boot on the most likely starting file.
        .nullish(),
})

export const config = loadConfig({
    schema,
    // CONFIG_PATH lets the deployment point at a file mounted next to compose.yml.
    yamlPath:
        process.env.CONFIG_PATH ??
        resolve(dirname(fileURLToPath(import.meta.url)), '..', 'config.yaml'),
    envMap: {
        PORT: 'server.port',
        DATABASE_URL: 'database.url',
        CORS_ORIGIN: 'server.corsOrigin',
        DISCORD_CLIENT_ID: 'discord.clientId',
        DISCORD_CLIENT_SECRET: 'discord.clientSecret',
        DISCORD_REDIRECT_URI: 'discord.redirectUri',
        IUT_DISPLAY_NAME: 'iut.displayName',
        IUT_ISSUER_URL: 'iut.issuerUrl',
        IUT_CLIENT_ID: 'iut.clientId',
        IUT_CLIENT_SECRET: 'iut.clientSecret',
        IUT_REDIRECT_URI: 'iut.redirectUri',
        JWT_SECRET: 'jwt.secret',
        PUSH_VAPID_PUBLIC_KEY: 'push.publicKey',
        PUSH_VAPID_PRIVATE_KEY: 'push.privateKey',
        PUSH_VAPID_SUBJECT: 'push.subject',
    },
})

export type Config = z.infer<typeof schema>
