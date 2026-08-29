import { swaggerUI } from '@hono/swagger-ui'
import { OpenAPIHono } from '@hono/zod-openapi'
import { cors } from 'hono/cors'
import { config } from './config.js'
import authController from './controllers/auth.js'
import assignmentsController from './controllers/assignments.js'
import eventsController from './controllers/events.js'
import groupsController from './controllers/groups.js'
import roomsController from './controllers/rooms.js'
import teachersController from './controllers/teachers.js'
import adminUsersController from './controllers/admin/users.js'
import adminGuildsController from './controllers/admin/guilds.js'

const _app = new OpenAPIHono()

_app.openAPIRegistry.registerComponent('securitySchemes', 'Bearer', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
})

_app.doc('/api/docs/openapi.json', (c) => ({
    openapi: '3.0.0',
    info: { title: 'StudySuite API', version: '1.0.0', description: 'API for the StudySuite application' },
    servers: [{ url: new URL(c.req.url).origin }],
}))

_app.get('/api/docs', swaggerUI({ url: '/api/docs/openapi.json' }))

_app.onError((err, c) => {
    console.error(err)
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, 500)
})

const app = _app
    .use('*', cors({ origin: config.server.corsOrigin }))
    // Everything the browser reaches lives under /api, so nginx needs a single
    // proxy rule and the SPA owns every other path.
    .route(
        '/api',
        new OpenAPIHono()
            .get('/health', (c) => c.json({ status: 'ok' }))
            .route('/auth', authController)
            .route('/events', eventsController)
            .route('/teachers', teachersController)
            .route('/rooms', roomsController)
            .route('/groups', groupsController)
            .route('/assignments', assignmentsController),
    )
    // Transitional: Discord may still call back on the pre-/api path until the
    // developer portal entry is updated. Remove once that is done.
    .route('/auth', authController)
    .route(
        '/api/admin',
        new OpenAPIHono()
            .route('/users', adminUsersController)
            .route('/guilds', adminGuildsController),
    )

export type AppType = typeof app

export default {
    port: config.server.port,
    fetch: app.fetch,
}
