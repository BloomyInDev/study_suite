import { and, eq, inArray } from 'drizzle-orm'
import { userIdentities } from '@studysuite/db'
import { db } from '../db.js'
import type { IdentitySummary, Provider } from './identity-display.js'

export * from './identity-display.js'

export type IdentityUpsert = {
    provider: Provider
    subject: string
    providerSubRaw?: string | null
    username?: string | null
    email?: string | null
    avatarUrl?: string | null
    accessToken?: string | null
    tokenExpiresAt?: Date | null
}

export async function findUserIdByIdentity(
    provider: Provider,
    subject: string,
): Promise<string | null> {
    const [row] = await db
        .select({ userId: userIdentities.userId })
        .from(userIdentities)
        .where(and(eq(userIdentities.provider, provider), eq(userIdentities.subject, subject)))
        .limit(1)
    return row?.userId ?? null
}

export async function upsertIdentity(userId: string, identity: IdentityUpsert): Promise<void> {
    const { provider, subject, ...rest } = identity
    await db
        .insert(userIdentities)
        .values({ userId, provider, subject, ...rest })
        .onConflictDoUpdate({
            target: [userIdentities.provider, userIdentities.subject],
            set: { ...rest, userId, updatedAt: new Date() },
        })
}

export async function listIdentities(userIds: string[]): Promise<Map<string, IdentitySummary[]>> {
    const byUser = new Map<string, IdentitySummary[]>()
    if (userIds.length === 0) return byUser
    const rows = await db
        .select({
            userId: userIdentities.userId,
            provider: userIdentities.provider,
            subject: userIdentities.subject,
            username: userIdentities.username,
            avatarUrl: userIdentities.avatarUrl,
        })
        .from(userIdentities)
        .where(inArray(userIdentities.userId, userIds))
        .orderBy(userIdentities.createdAt)
    for (const { userId, ...rest } of rows) {
        const list = byUser.get(userId) ?? []
        list.push(rest)
        byUser.set(userId, list)
    }
    return byUser
}
