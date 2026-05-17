import { Hono } from 'hono'
import { VERSION } from '@studysuite/shared'

// validate workspace resolution
void VERSION

const app = new Hono()

app.get('/', (c) => c.json({ status: 'ok' }))
app.get('/health', (c) => c.json({ status: 'ok' }))

export default {
  port: 3000,
  fetch: app.fetch,
}
