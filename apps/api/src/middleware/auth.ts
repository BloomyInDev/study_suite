import { and, eq, inArray } from 'drizzle-orm'
import { userIdentities, users } from '@studysuite/db'
import { createMiddleware } from 'hono/factory'
import { verify } from 'hono/jwt'
import { config } from '../config.js'
import { db } from '../db.js'
import { isSnowflake, matchesBotKey } from '../lib/bot-key.js'
import { fetchEnrichedUser } from '../lib/users.js'

export type JwtPayload = {
    sub: string
    isAdmin: boolean
    status: 'pending' | 'approved' | 'rejected'
    role: 'student' | 'teacher' | null
    exp: number
}

export type AuthEnv = { Variables: { user: JwtPayload } }

/**
 * The Discord bot acting for one of its members: `Authorization: Bot <key>`
 * plus `X-Acting-Discord-User: <snowflake>`, resolved to the account that
 * Discord identity is linked to. The request then runs exactly as that user's
 * own would — same group, same approval status, same `completedByMe`.
 *
 * Never as an admin, though: the bot has no admin surface, and a leaked key
 * should not reach the admin routes through whichever admin it names.
 */
async function resolveBotActor(discordId: string): Promise<JwtPayload | null> {
    const user = await fetchEnrichedUser(
        inArray(
            users.id,
            db
                .select({ id: userIdentities.userId })
                .from(userIdentities)
                .where(
                    and(
                        eq(userIdentities.provider, 'discord'),
                        eq(userIdentities.subject, discordId),
                    ),
                ),
        ),
    )
    if (!user) return null
    return { sub: user.id, isAdmin: false, status: user.status, role: user.role, exp: 0 }
}

export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
    const authHeader = c.req.header('Authorization')
    if (authHeader?.startsWith('Bot ')) {
        if (!matchesBotKey(authHeader, config.bot?.apiKeys)) {
            return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid bot key' } }, 401)
        }
        const discordId = c.req.header('X-Acting-Discord-User')
        if (!isSnowflake(discordId)) {
            return c.json(
                {
                    error: {
                        code: 'UNAUTHORIZED',
                        message: 'Bot requests on user routes need X-Acting-Discord-User',
                    },
                },
                401,
            )
        }
        const actor = await resolveBotActor(discordId)
        if (!actor) {
            // Distinct code so the bot can tell the member to sign in once.
            return c.json(
                {
                    error: {
                        code: 'NOT_LINKED',
                        message: 'No StudySuite account is linked to this Discord user',
                    },
                },
                403,
            )
        }
        c.set('user', actor)
        return next()
    }
    if (!authHeader?.startsWith('Bearer ')) {
        return c.json({ error: { code: 'UNAUTHORIZED', message: 'Missing token' } }, 401)
    }
    const token = authHeader.slice(7)
    let payload: JwtPayload
    try {
        payload = (await verify(token, config.jwt.secret, 'HS256')) as JwtPayload
    } catch {
        return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } }, 401)
    }

    // Tokens live for a week, so status and isAdmin are read from the database:
    // rejecting or demoting someone has to take effect immediately.
    const [current] = await db
        .select({ status: users.status, isAdmin: users.isAdmin })
        .from(users)
        .where(eq(users.id, payload.sub))
        .limit(1)
    if (!current) {
        return c.json({ error: { code: 'UNAUTHORIZED', message: 'Unknown user' } }, 401)
    }

    c.set('user', { ...payload, status: current.status, isAdmin: current.isAdmin })
    await next()
})

export const requireAdmin = createMiddleware<AuthEnv>(async (c, next) => {
    const user = c.get('user')
    if (!user?.isAdmin) {
        return c.json({ error: { code: 'FORBIDDEN', message: 'Admin access required' } }, 403)
    }
    await next()
})

/**
 * The bot itself, acting for no one: for the /api/bot routes that serve a
 * whole channel (a class's homework reminders, the role mappings) rather than
 * one member. 503 while no key is configured, like the other optional blocks.
 */
export const requireBot = createMiddleware(async (c, next) => {
    if (!config.bot) {
        return c.json(
            { error: { code: 'SERVICE_UNAVAILABLE', message: 'Bot access is not configured' } },
            503,
        )
    }
    if (!matchesBotKey(c.req.header('Authorization'), config.bot.apiKeys)) {
        return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid bot key' } }, 401)
    }
    await next()
})

/**
 * Attaches the user when a valid token is present, and lets the request through
 * when it is not.
 *
 * For routes that serve visitors and account holders alike — push
 * subscriptions, like the event routes they feed on, work without an account.
 * A bad or expired token is treated as no token: the caller gets the
 * anonymous behaviour rather than a 401 they cannot act on.
 */
export const optionalAuth = createMiddleware<{ Variables: { user?: JwtPayload } }>(
    async (c, next) => {
        const authHeader = c.req.header('Authorization')
        if (authHeader?.startsWith('Bearer ')) {
            try {
                const payload = (await verify(
                    authHeader.slice(7),
                    config.jwt.secret,
                    'HS256',
                )) as JwtPayload
                const [current] = await db
                    .select({ id: users.id })
                    .from(users)
                    .where(eq(users.id, payload.sub))
                    .limit(1)
                if (current) c.set('user', payload)
            } catch {
                // Anonymous it is.
            }
        }
        await next()
    },
)
