import type { AppType } from '@studysuite/api'
import { hc } from 'hono/client'
import { API_URL } from './api-url'


export const backend = hc<AppType>(API_URL, {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => {
        const token = localStorage.getItem('auth_token')
        const headers = new Headers(init?.headers)
        if (token) headers.set('Authorization', `Bearer ${token}`)
        return fetch(input, { ...init, headers })
    },
})
