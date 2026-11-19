import { useAdminModeStore } from '../stores/admin-mode.js'

/**
 * The headers every call to our api carries: the session token, and
 * `X-Admin-Mode` while an admin has the mode on. The api reads the latter to
 * treat an admin as one only when they asked to be (see `stores/admin-mode.ts`),
 * so a call that builds its own headers would silently act as a student.
 */
export function authHeaders(): Record<string, string> {
    const token = localStorage.getItem('auth_token')
    return {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...useAdminModeStore().headers(),
    }
}
