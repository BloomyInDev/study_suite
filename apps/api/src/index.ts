import { Hono } from 'hono'
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

const api = new Hono()
    .route('/events', eventsController)
    .route('/teachers', teachersController)
    .route('/rooms', roomsController)
    .route('/groups', groupsController)
    .route('/assignments', assignmentsController)

const adminApi = new Hono()
    .route('/users', adminUsersController)
    .route('/guilds', adminGuildsController)

const app = new Hono()
    .use('*', cors({ origin: config.server.corsOrigin }))
    .get('/health', (c) => c.json({ status: 'ok' }))
    .route('/auth', authController)
    .route('/api', api)
    .route('/api/admin', adminApi)

export type AppType = typeof app

app.onError((err, c) => {
    console.error(err)
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, 500)
})

export default {
    port: config.server.port,
    fetch: app.fetch,
}
