import type { AppType } from '@studysuite/api'
import { hc } from 'hono/client'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export const backend = hc<AppType>(BASE_URL, {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => {
    const token = localStorage.getItem('auth_token')
    const headers = new Headers(init?.headers)
    if (token) headers.set('Authorization', `Bearer ${token}`)
    return fetch(input, { ...init, headers })
  },
})
