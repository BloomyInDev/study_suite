import { useAuthStore } from '../stores/auth.js'
import { authHeaders } from './auth-headers.js'

/**
 * `fetch` with `authHeaders()` added, which also ends the session when the api
 * rejects its token. Every authenticated call should go through here or
 * `backend`, or an expired session goes unnoticed on that page.
 */
export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const headers = new Headers(init?.headers)
    const sent = authHeaders()
    for (const [name, value] of Object.entries(sent)) headers.set(name, value)
    const res = await fetch(input, { ...init, headers })
    useAuthStore().noteResponse(res, sent.Authorization?.slice('Bearer '.length) ?? null)
    return res
}
