/**
 * Admin mode. An admin account is often a student's, and browses the app as
 * one: the web app sends `X-Admin-Mode: 1` only while the admin has switched
 * the mode on (`stores/admin-mode.ts` in the web app). Routes that treat an
 * admin differently from a student ask `actsAsAdmin()`, so the flag alone never
 * widens what an admin's everyday browsing can do.
 *
 * Not a security boundary: the header is the admin's own choice, and the flag
 * is what grants it. `/api/admin/*` checks the flag alone.
 */
export const ADMIN_MODE_HEADER = 'X-Admin-Mode'

export function actsAsAdmin(isAdmin: boolean, header: string | undefined): boolean {
    return isAdmin && header === '1'
}
