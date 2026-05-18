import { Hono } from 'hono'
import { config } from './config.js'

const app = new Hono()

app.get('/', (c) => c.json({ status: 'ok' }))
app.get('/health', (c) => c.json({ status: 'ok' }))

export default {
  port: config.server.port,
  fetch: app.fetch,
}
