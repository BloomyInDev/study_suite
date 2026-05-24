import { createMiddleware } from 'hono/factory'
import { verify } from 'hono/jwt'
import { config } from '../config.js'

export type JwtPayload = {
    sub: string
    discordId: string
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
    try {
        const payload = (await verify(token, config.jwt.secret, 'HS256')) as JwtPayload
        c.set('user', payload)
        await next()
    } catch {
        return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } }, 401)
    }
})

export const requireAdmin = createMiddleware<AuthEnv>(async (c, next) => {
    const user = c.get('user')
    if (!user?.isAdmin) {
        return c.json({ error: { code: 'FORBIDDEN', message: 'Admin access required' } }, 403)
    }
    await next()
})
