import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { config } from './config.js'
import eventsController from './controllers/events.js'
import groupsController from './controllers/groups.js'
import roomsController from './controllers/rooms.js'
import teachersController from './controllers/teachers.js'

const api = new Hono()
  .route('/events', eventsController)
  .route('/teachers', teachersController)
  .route('/rooms', roomsController)
  .route('/groups', groupsController)

const app = new Hono()
  .use('*', cors({ origin: 'http://localhost:5173' }))
  .get('/health', (c) => c.json({ status: 'ok' }))
  .route('/api', api)

export type AppType = typeof app

app.onError((err, c) => {
  console.error(err)
  return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, 500)
})

export default {
  port: config.server.port,
  fetch: app.fetch,
}
