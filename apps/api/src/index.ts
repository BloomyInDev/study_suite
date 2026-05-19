import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { config } from './config.js'
import eventsController from './controllers/events.js'
import groupsController from './controllers/groups.js'
import roomsController from './controllers/rooms.js'
import teachersController from './controllers/teachers.js'

const app = new Hono()

app.use('*', cors({ origin: 'http://localhost:5173' }))

app.get('/health', (c) => c.json({ status: 'ok' }))

const api = new Hono()
api.route('/events', eventsController)
api.route('/teachers', teachersController)
api.route('/rooms', roomsController)
api.route('/groups', groupsController)

app.route('/api', api)

app.onError((err, c) => {
  console.error(err)
  return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, 500)
})

export default {
  port: config.server.port,
  fetch: app.fetch,
}
