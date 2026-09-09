import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { pushSubscriptions } from '@studysuite/db'
import { eq } from 'drizzle-orm'
import { db } from '../db.js'
import { pushConfigured, sendReminder } from '../lib/push.js'
import { optionalAuth, type JwtPayload } from '../middleware/auth.js'
import { dataResponse, errorResponse } from '../schemas/responses.js'

type Env = { Variables: { user?: JwtPayload } }

const SubscriptionInput = z
    .object({
        endpoint: z.string().url().openapi({
            description: 'The push service URL the browser handed out',
            example: 'https://fcm.googleapis.com/fcm/send/dK3f…',
        }),
        keys: z.object({
            p256dh: z.string().min(1),
            auth: z.string().min(1),
        }),
        groupIds: z.array(z.string().uuid()).max(50).openapi({
            description:
                'Ancestors included — widen with the same rule `GET /api/events` callers use, or a promo-wide lecture never matches.',
        }),
        leadMinutes: z.number().int().min(1).max(180).default(15),
    })
    .openapi('PushSubscriptionInput')

const SubscriptionDto = z
    .object({
        endpoint: z.string(),
        groupIds: z.array(z.string()),
        leadMinutes: z.number(),
        linkedToAccount: z.boolean(),
    })
    .openapi('PushSubscription')

const EndpointQuery = z.object({
    endpoint: z
        .string()
        .url()
        .openapi({ param: { name: 'endpoint', in: 'query' } }),
})

const base = new OpenAPIHono<Env>()

/** Every route here is pointless without a keypair; say so once. */
base.use('*', async (c, next) => {
    if (!pushConfigured) {
        return c.json(
            {
                error: {
                    code: 'PUSH_NOT_CONFIGURED',
                    message: 'This deployment has no VAPID keypair; course reminders are disabled.',
                },
            },
            503,
        )
    }
    await next()
})

base.use('*', optionalAuth)

/**
 * The routes are chained, and the middleware above is not, because `.use()`
 * hands back a plain `Hono` while `.openapi()` returns the instance with the
 * route folded into its type. That accumulated type *is* `AppType`, which is
 * what gives the web app a typed `backend.api.push.*` — register a route as a
 * bare statement and the client simply does not know it exists.
 */
const app = base
    .openapi(
        createRoute({
            method: 'put',
            path: '/subscriptions',
            operationId: 'upsertPushSubscription',
            summary: 'Register this browser for course reminders',
            description:
                'Idempotent on `endpoint`: a browser that re-subscribes — after a permission reset, a settings change, or a push service key rotation — updates its row instead of adding one. Works without an account, like the event routes it draws on; sending a token links the subscription to the user so it dies with them.',
            tags: ['Push'],
            request: {
                body: { content: { 'application/json': { schema: SubscriptionInput } } },
            },
            responses: {
                200: dataResponse(SubscriptionDto, 'The stored subscription'),
                503: errorResponse('No VAPID keypair configured'),
            },
        }),
        async (c) => {
            const body = c.req.valid('json')
            const userId = c.get('user')?.sub ?? null

            const [row] = await db
                .insert(pushSubscriptions)
                .values({
                    userId,
                    endpoint: body.endpoint,
                    p256dh: body.keys.p256dh,
                    auth: body.keys.auth,
                    groupIds: body.groupIds,
                    leadMinutes: body.leadMinutes,
                })
                .onConflictDoUpdate({
                    target: pushSubscriptions.endpoint,
                    set: {
                        userId,
                        p256dh: body.keys.p256dh,
                        auth: body.keys.auth,
                        groupIds: body.groupIds,
                        leadMinutes: body.leadMinutes,
                        // A browser that just re-subscribed is alive again.
                        failureCount: 0,
                        updatedAt: new Date(),
                    },
                })
                .returning()

            return c.json(
                {
                    data: {
                        endpoint: row.endpoint,
                        groupIds: row.groupIds,
                        leadMinutes: row.leadMinutes,
                        linkedToAccount: row.userId !== null,
                    },
                },
                200,
            )
        },
    )

    .openapi(
        createRoute({
            method: 'get',
            path: '/subscriptions',
            operationId: 'getPushSubscription',
            summary: 'Read back what this browser is registered for',
            description:
                'Lets the settings screen show the real lead time after a reload, rather than trusting what the browser happens to have in local storage.',
            tags: ['Push'],
            request: { query: EndpointQuery },
            responses: {
                200: dataResponse(SubscriptionDto.nullable(), 'The subscription, or null'),
                503: errorResponse('No VAPID keypair configured'),
            },
        }),
        async (c) => {
            const { endpoint } = c.req.valid('query')
            const [row] = await db
                .select()
                .from(pushSubscriptions)
                .where(eq(pushSubscriptions.endpoint, endpoint))
                .limit(1)

            return c.json(
                {
                    data: row
                        ? {
                              endpoint: row.endpoint,
                              groupIds: row.groupIds,
                              leadMinutes: row.leadMinutes,
                              linkedToAccount: row.userId !== null,
                          }
                        : null,
                },
                200,
            )
        },
    )

    .openapi(
        createRoute({
            method: 'delete',
            path: '/subscriptions',
            operationId: 'deletePushSubscription',
            summary: 'Stop reminders for this browser',
            tags: ['Push'],
            request: { query: EndpointQuery },
            responses: {
                200: dataResponse(z.object({ deleted: z.boolean() }), 'Whether a row was removed'),
                503: errorResponse('No VAPID keypair configured'),
            },
        }),
        async (c) => {
            const { endpoint } = c.req.valid('query')
            const deleted = await db
                .delete(pushSubscriptions)
                .where(eq(pushSubscriptions.endpoint, endpoint))
                .returning({ id: pushSubscriptions.id })

            return c.json({ data: { deleted: deleted.length > 0 } }, 200)
        },
    )

    .openapi(
        createRoute({
            method: 'post',
            path: '/test',
            operationId: 'sendTestPush',
            summary: 'Send this browser a notification now',
            description:
                'The end-to-end check. Everything between the api and the phone — VAPID signature, payload encryption, the push service, the service worker — either works here or nowhere, and a permission that looks granted in the browser UI can still be silently dead.',
            tags: ['Push'],
            request: { query: EndpointQuery },
            responses: {
                200: dataResponse(
                    z.object({ result: z.enum(['sent', 'gone', 'failed']) }),
                    'Outcome',
                ),
                404: errorResponse('This browser is not subscribed'),
                503: errorResponse('No VAPID keypair configured'),
            },
        }),
        async (c) => {
            const { endpoint } = c.req.valid('query')
            const [row] = await db
                .select()
                .from(pushSubscriptions)
                .where(eq(pushSubscriptions.endpoint, endpoint))
                .limit(1)

            if (!row) {
                return c.json(
                    { error: { code: 'NOT_FOUND', message: 'No subscription for this endpoint' } },
                    404,
                )
            }

            const result = await sendReminder(
                row,
                {
                    title: 'Study Suite',
                    body: 'Les rappels de cours fonctionnent 🎉',
                    eventId: 'test',
                    url: '/',
                },
                60,
            )

            if (result === 'gone') {
                await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, row.id))
            }

            return c.json({ data: { result } }, 200)
        },
    )

export default app
