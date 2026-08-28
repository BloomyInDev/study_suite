/**
 * Base URL for the API, without a trailing slash.
 *
 * The docker build passes VITE_API_URL=/ so requests stay same-origin and
 * nginx proxies them; concatenating that directly would yield `//auth/...`,
 * which browsers treat as protocol-relative.
 */
export const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
