export type Provider = 'discord' | 'iut'

export type IdentitySummary = {
    provider: Provider
    /** What the account is keyed on — a Discord snowflake, or an LDAP uid. */
    subject: string
    /** The label to show a human, not the key: a Discord global name, a full name. */
    username: string | null
    avatarUrl: string | null
}

/**
 * Discord first: it is the name everyone already recognises in the app, and
 * only accounts created through the IUT bridge have no Discord identity.
 */
const DISPLAY_ORDER: Provider[] = ['discord', 'iut']

export function pickDisplay(identities: IdentitySummary[]): {
    displayName: string
    avatarUrl: string | null
} {
    for (const provider of DISPLAY_ORDER) {
        const found = identities.find((i) => i.provider === provider)
        if (found) {
            return { displayName: found.username ?? found.subject, avatarUrl: found.avatarUrl }
        }
    }
    return { displayName: identities[0]?.username ?? 'Utilisateur', avatarUrl: null }
}
