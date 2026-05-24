import { Hono } from 'hono'
import { sign } from 'hono/jwt'
import { eq, inArray, type SQL } from 'drizzle-orm'
import { db } from '../db.js'
import { users, userStudents, userTeachers, discordGuilds, discordRoleMappings } from '@studysuite/db'
import { config } from '../config.js'
import { requireAuth, type AuthEnv } from '../middleware/auth.js'

const DISCORD_API = 'https://discord.com/api/v10'

type DiscordTokenResponse = { access_token: string; token_type: string; expires_in: number }
type DiscordUser = {
    id: string
    username: string
    avatar: string | null
    global_name: string | null
}
type DiscordMember = { roles: string[] }

type OAuthState = { clientRedirectUri?: string }

export type EnrichedUser = typeof users.$inferSelect & {
    role: 'student' | 'teacher' | null
    studentGroupId: string | null
    teacherId: string | null
}

async function fetchEnrichedUser(where: SQL | undefined): Promise<EnrichedUser | null> {
    const rows = await db
        .select({
            id: users.id,
            discordId: users.discordId,
            discordUsername: users.discordUsername,
            discordAvatar: users.discordAvatar,
            isAdmin: users.isAdmin,
            status: users.status,
            discordAccessToken: users.discordAccessToken,
            discordTokenExpiresAt: users.discordTokenExpiresAt,
            createdAt: users.createdAt,
            updatedAt: users.updatedAt,
            _studentUserId: userStudents.userId,
            _teacherUserId: userTeachers.userId,
            studentGroupId: userStudents.studentGroupId,
            teacherId: userTeachers.teacherId,
        })
        .from(users)
        .leftJoin(userStudents, eq(userStudents.userId, users.id))
        .leftJoin(userTeachers, eq(userTeachers.userId, users.id))
        .where(where)
        .limit(1)

    const row = rows[0]
    if (!row) return null

    const { _studentUserId, _teacherUserId, ...rest } = row
    return {
        ...rest,
        role: _studentUserId ? 'student' : _teacherUserId ? 'teacher' : null,
        studentGroupId: rest.studentGroupId ?? null,
        teacherId: rest.teacherId ?? null,
    }
}

function parseState(raw: string | undefined): OAuthState {
    if (!raw) return {}
    try {
        return JSON.parse(Buffer.from(raw, 'base64url').toString('utf-8')) as OAuthState
    } catch {
        return {}
    }
}

function safeRedirectUri(uri: string | undefined): string | undefined {
    if (!uri) return undefined
    try {
        const url = new URL(uri)
        return ['http:', 'https:'].includes(url.protocol) ? uri : undefined
    } catch {
        return undefined
    }
}

function userToDto(user: EnrichedUser) {
    return {
        id: user.id,
        discordId: user.discordId,
        discordUsername: user.discordUsername,
        discordAvatar: user.discordAvatar,
        role: user.role,
        isAdmin: user.isAdmin,
        status: user.status,
        studentGroupId: user.studentGroupId,
        teacherId: user.teacherId,
    }
}

async function issueToken(user: EnrichedUser): Promise<string> {
    return sign(
        {
            sub: user.id,
            discordId: user.discordId,
            isAdmin: user.isAdmin,
            status: user.status,
            role: user.role,
            exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
        },
        config.jwt.secret,
        'HS256',
    )
}

async function upsertProfile(
    userId: string,
    role: 'student' | 'teacher',
    groupId: string | null,
): Promise<void> {
    if (role === 'student') {
        await db
            .insert(userStudents)
            .values({ userId, studentGroupId: groupId })
            .onConflictDoUpdate({
                target: userStudents.userId,
                set: { studentGroupId: groupId },
            })
    } else {
        await db.insert(userTeachers).values({ userId }).onConflictDoNothing()
    }
}

export default new Hono<AuthEnv>()
    .get('/discord', (c) => {
        const clientRedirectUri = safeRedirectUri(c.req.query('redirect_uri'))
        const state: OAuthState = clientRedirectUri ? { clientRedirectUri } : {}
        const stateParam = Buffer.from(JSON.stringify(state)).toString('base64url')

        const params = new URLSearchParams({
            client_id: config.discord.clientId,
            redirect_uri: config.discord.redirectUri,
            response_type: 'code',
            scope: 'identify guilds guilds.members.read',
            state: stateParam,
        })
        return c.redirect(`https://discord.com/api/oauth2/authorize?${params}`)
    })

    .get('/discord/callback', async (c) => {
        const { clientRedirectUri } = parseState(c.req.query('state'))

        const errorResponse = (code: string, message: string) => {
            if (clientRedirectUri) {
                const url = new URL(clientRedirectUri)
                url.searchParams.set('error', code)
                return c.redirect(url.toString())
            }
            return c.json({ error: { code, message } }, 400)
        }

        const code = c.req.query('code')
        if (!code) return errorResponse('missing_code', 'Missing authorization code')

        // Exchange code for Discord access token
        const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: config.discord.clientId,
                client_secret: config.discord.clientSecret,
                grant_type: 'authorization_code',
                code,
                redirect_uri: config.discord.redirectUri,
            }),
        })
        if (!tokenRes.ok)
            return errorResponse('discord_auth_failed', 'Discord token exchange failed')
        const { access_token, expires_in } = (await tokenRes.json()) as DiscordTokenResponse
        const tokenExpiresAt = new Date(Date.now() + expires_in * 1000)

        // Fetch Discord user info
        const userRes = await fetch(`${DISCORD_API}/users/@me`, {
            headers: { Authorization: `Bearer ${access_token}` },
        })
        if (!userRes.ok) return errorResponse('discord_user_failed', 'Failed to fetch Discord user')
        const discordUser = (await userRes.json()) as DiscordUser

        // Fetch member roles from all configured guilds (in parallel)
        const guilds = await db.select().from(discordGuilds)
        const memberRoleResults = await Promise.all(
            guilds.map(async (guild) => {
                const res = await fetch(
                    `${DISCORD_API}/users/@me/guilds/${guild.discordGuildId}/member`,
                    { headers: { Authorization: `Bearer ${access_token}` } },
                )
                if (!res.ok) return { guildDbId: guild.id, roles: [] as string[] }
                const member = (await res.json()) as DiscordMember
                return { guildDbId: guild.id, roles: member.roles ?? [] }
            }),
        )

        // Find valid role → class mappings across all guilds
        const allRoleIds = memberRoleResults.flatMap((r) => r.roles)
        const mappings =
            allRoleIds.length > 0
                ? await db
                      .select()
                      .from(discordRoleMappings)
                      .where(inArray(discordRoleMappings.discordRoleId, allRoleIds))
                : []

        const validMappings = mappings.filter((m) =>
            memberRoleResults.some(
                (r) => r.guildDbId === m.guildId && r.roles.includes(m.discordRoleId),
            ),
        )

        const autoApproved = validMappings.length > 0
        const firstMapping = validMappings[0]
        const mappedRole = autoApproved ? (firstMapping.userRole as 'student' | 'teacher') : null
        const mappedGroupId = mappedRole === 'student' ? (firstMapping.studentGroupId ?? null) : null

        // Upsert user in users table
        const existing = await db
            .select()
            .from(users)
            .where(eq(users.discordId, discordUser.id))
            .limit(1)

        let userId: string
        const wasAlreadyApproved = existing.length > 0 && existing[0].status === 'approved'

        if (existing.length > 0) {
            await db
                .update(users)
                .set({
                    discordUsername: discordUser.global_name ?? discordUser.username,
                    discordAvatar: discordUser.avatar,
                    discordAccessToken: access_token,
                    discordTokenExpiresAt: tokenExpiresAt,
                    ...(autoApproved && !wasAlreadyApproved
                        ? { status: 'approved' as const }
                        : {}),
                    updatedAt: new Date(),
                })
                .where(eq(users.discordId, discordUser.id))
            userId = existing[0].id
        } else {
            const [created] = await db
                .insert(users)
                .values({
                    discordId: discordUser.id,
                    discordUsername: discordUser.global_name ?? discordUser.username,
                    discordAvatar: discordUser.avatar,
                    discordAccessToken: access_token,
                    discordTokenExpiresAt: tokenExpiresAt,
                    status: autoApproved ? 'approved' : 'pending',
                })
                .returning({ id: users.id })
            userId = created.id
        }

        // Create profile on first approval
        if (autoApproved && !wasAlreadyApproved && mappedRole) {
            await upsertProfile(userId, mappedRole, mappedGroupId)
        }

        const enriched = await fetchEnrichedUser(eq(users.id, userId))
        const token = await issueToken(enriched!)

        if (clientRedirectUri) {
            const url = new URL(clientRedirectUri)
            url.searchParams.set('token', token)
            return c.redirect(url.toString())
        }
        return c.json({ data: userToDto(enriched!), token })
    })

    .get('/discord/my-guilds', requireAuth, async (c) => {
        const payload = c.get('user')
        const [user] = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1)
        if (!user?.discordAccessToken) {
            return c.json(
                { error: { code: 'NO_TOKEN', message: 'No Discord token stored. Please re-login.' } },
                400,
            )
        }
        if (user.discordTokenExpiresAt && user.discordTokenExpiresAt < new Date()) {
            return c.json(
                { error: { code: 'TOKEN_EXPIRED', message: 'Discord token expired. Please re-login.' } },
                401,
            )
        }
        const token = user.discordAccessToken

        type DiscordGuild = { id: string; name: string; icon: string | null }
        const guildsRes = await fetch(`${DISCORD_API}/users/@me/guilds`, {
            headers: { Authorization: `Bearer ${token}` },
        })
        if (!guildsRes.ok) {
            return c.json(
                { error: { code: 'DISCORD_ERROR', message: 'Failed to fetch Discord guilds' } },
                502,
            )
        }
        const guildList = (await guildsRes.json()) as DiscordGuild[]

        const guildData = await Promise.all(
            guildList.map(async (guild) => {
                const memberRes = await fetch(
                    `${DISCORD_API}/users/@me/guilds/${guild.id}/member`,
                    { headers: { Authorization: `Bearer ${token}` } },
                )
                const roles: string[] = memberRes.ok
                    ? (((await memberRes.json()) as { roles: string[] }).roles ?? [])
                    : []
                return { id: guild.id, name: guild.name, icon: guild.icon, myRoles: roles }
            }),
        )

        return c.json({ data: guildData })
    })

    .get('/me', requireAuth, async (c) => {
        const payload = c.get('user')
        const enriched = await fetchEnrichedUser(eq(users.id, payload.sub))
        if (!enriched) {
            return c.json({ error: { code: 'NOT_FOUND', message: 'User not found' } }, 404)
        }
        const token = await issueToken(enriched)
        return c.json({ data: userToDto(enriched), token })
    })
