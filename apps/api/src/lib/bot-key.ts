import { createHash, timingSafeEqual } from 'node:crypto'

const digest = (s: string) => createHash('sha256').update(s).digest()

/**
 * Whether an `Authorization` header carries one of the bots' keys.
 *
 * Both sides are hashed first so `timingSafeEqual` always compares equal
 * lengths: comparing the raw strings would leak a key's length, and a plain
 * `===` leaks how many leading characters matched. Every key is compared, not
 * just up to the first match, so the timing does not say which one it was.
 */
export function matchesBotKey(
    authHeader: string | undefined,
    apiKeys: readonly string[] | undefined,
): boolean {
    if (!apiKeys?.length || !authHeader?.startsWith('Bot ')) return false
    const presented = digest(authHeader.slice(4))
    let matched = false
    for (const key of apiKeys) {
        if (key && timingSafeEqual(presented, digest(key))) matched = true
    }
    return matched
}

/** A Discord snowflake: an unsigned 64-bit integer, 17 to 20 digits today. */
export function isSnowflake(value: string | undefined): value is string {
    return value !== undefined && /^\d{17,20}$/.test(value)
}
