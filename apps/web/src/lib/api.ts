import type { AppType } from '@studysuite/api'
import { hc } from 'hono/client'
import { API_URL } from './api-url'
import { authHeaders } from './auth-headers.js'


export const backend = hc<AppType>(API_URL, {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers)
        for (const [name, value] of Object.entries(authHeaders())) headers.set(name, value)
        return fetch(input, { ...init, headers })
    },
})
