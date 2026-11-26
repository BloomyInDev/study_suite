import type { AppType } from '@studysuite/api'
import { hc } from 'hono/client'
import { API_URL } from './api-url'
import { authFetch } from './auth-fetch.js'

export const backend = hc<AppType>(API_URL, { fetch: authFetch })
