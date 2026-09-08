import type { JWTPayload } from 'jose'

export type IutClaims = JWTPayload & {
    preferred_username?: string
    name?: string
    email?: string
    groups?: string[]
}

/**
 * The claim that keys the account. The bridge's `sub` is the raw LDAP DN
 * (`uid=lubenb,ou=Ann3,…`), so it changes at every year rollover and would
 * orphan the account each September; `preferred_username` is the stable half.
 */
export function iutSubject(claims: IutClaims): string | null {
    if (claims.preferred_username) return claims.preferred_username
    // Last resort: pull the uid out of the DN ourselves.
    const match = /(?:^|,)uid=([^,]+)/.exec(String(claims.sub ?? ''))
    return match?.[1] ?? null
}
