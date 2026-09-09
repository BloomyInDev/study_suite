import { eq } from 'drizzle-orm'
import { users } from '@studysuite/db'
import { createMiddleware } from 'hono/factory'
import { verify } from 'hono/jwt'
import { config } from '../config.js'
import { db } from '../db.js'

export type JwtPayload = {
    sub: string
    isAdmin: boolean
    status: 'pending' | 'approved' | 'rejected'
    role: 'student' | 'teacher' | null
    exp: number
}

export type AuthEnv = { Variables: { user: JwtPayload } }

export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
    const authHeader = c.req.header('Authorization')
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
