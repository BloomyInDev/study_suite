import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { eq, inArray } from 'drizzle-orm'
import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { sign, verify } from 'hono/jwt'
import { db } from '../db.js'
import { users, discordGuilds, discordRoleMappings, iutGroupMappings } from '@studysuite/db'
import { studentGroupMemberships, studentGroups, userStudents, userTeachers } from '@studysuite/db'
import { config } from '../config.js'
import { requireAuth, type AuthEnv, type JwtPayload } from '../middleware/auth.js'
import { UserDtoSchema, dataResponse, errorResponse, jsonResponse } from '../schemas/responses.js'
import { fetchEnrichedUser, userToDto, type EnrichedUser } from '../lib/users.js'
import { findUserIdByIdentity, upsertIdentity } from '../lib/identities.js'
import {
    buildAuthorizationUrl,
    createPkce,
    exchangeCode,
    iutSubject,
    OidcError,
    type IutClaims,
} from '../lib/oidc.js'

export type { EnrichedUser }

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

async function issueToken(user: EnrichedUser): Promise<string> {
    return sign(
        {
            sub: user.id,
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
            .values({ userId, studentGroupId: groupId, assignedGroupId: groupId })
            .onConflictDoUpdate({
                target: userStudents.userId,
                set: { studentGroupId: groupId, assignedGroupId: groupId },
            })
    } else {
        await db.insert(userTeachers).values({ userId }).onConflictDoNothing()
    }
}

/** Every group below `rootId`, walking the membership tree downwards. */
async function getDescendantGroupIds(rootId: string): Promise<Set<string>> {
    const result = new Set<string>()
    let current = [rootId]
    while (current.length > 0) {
        const rows = await db
            .select({ childId: studentGroupMemberships.childId })
            .from(studentGroupMemberships)
            .where(inArray(studentGroupMemberships.parentId, current))
        const next = [...new Set(rows.map((r) => r.childId))].filter((id) => !result.has(id))
        next.forEach((id) => result.add(id))
        current = next
    }
    return result
}

const StudentGroupBodySchema = z.object({ studentGroupId: z.string().uuid() })

const MyGuildSchema = z
    .object({
        id: z.string(),
        name: z.string(),
        icon: z.string().nullable(),
    })
    .openapi('MyGuild')

const app = new OpenAPIHono<AuthEnv>()

app.openapi(
    createRoute({
        method: 'get',
        path: '/discord',
        operationId: 'discordLogin',
        summary: 'Start the Discord OAuth2 flow',
        description:
            'Redirects to Discord. An optional `clientRedirectUri` is carried through the `state` parameter and receives the token at the end of the flow.',
        tags: ['Auth'],
        request: { query: z.object({ redirect_uri: z.string().url().optional() }) },
        responses: {
            302: { description: 'Redirect to Discord OAuth authorization' },
        },
    }),
    (c) => {
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
    },
)

app.openapi(
    createRoute({
        method: 'get',
        path: '/discord/callback',
        operationId: 'discordCallback',
        summary: 'Finish the Discord OAuth2 flow',
        description:
            'Exchanges the code, upserts the user, and auto-approves them when one of their Discord roles matches a configured mapping. Redirects with `?token=` when the flow began with a `clientRedirectUri`, otherwise answers with the token as JSON.',
        tags: ['Auth'],
        request: { query: z.object({ code: z.string().optional(), state: z.string().optional() }) },
        responses: {
            302: { description: 'Redirect back to client with token' },
            200: jsonResponse(
                z.object({ data: UserDtoSchema, token: z.string() }),
                'Auth result (when no clientRedirectUri)',
            ),
            400: errorResponse('Auth error'),
        },
    }),
    async (c) => {
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

        const userRes = await fetch(`${DISCORD_API}/users/@me`, {
            headers: { Authorization: `Bearer ${access_token}` },
        })
        if (!userRes.ok) return errorResponse('discord_user_failed', 'Failed to fetch Discord user')
        const discordUser = (await userRes.json()) as DiscordUser

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
        const mappedGroupId =
            mappedRole === 'student' ? (firstMapping.studentGroupId ?? null) : null

        // A user created by the previous revision, between the migration and
        // this deploy, has no identity row yet; discord_id still finds them.
        const existingId =
            (await findUserIdByIdentity('discord', discordUser.id)) ??
            (
                await db
                    .select({ id: users.id })
                    .from(users)
                    .where(eq(users.discordId, discordUser.id))
                    .limit(1)
            )[0]?.id ??
            null
        const existing = existingId
            ? await db.select().from(users).where(eq(users.id, existingId)).limit(1)
            : []

        let userId: string
        const wasAlreadyApproved = existing.length > 0 && existing[0].status === 'approved'
        // A role mapping must never undo an admin's decision to reject someone.
        const wasRejected = existing.length > 0 && existing[0].status === 'rejected'
        const shouldApprove = autoApproved && !wasAlreadyApproved && !wasRejected

        if (existing.length > 0) {
            await db
                .update(users)
                .set({
                    discordUsername: discordUser.global_name ?? discordUser.username,
                    discordAvatar: discordUser.avatar,
                    discordAccessToken: access_token,
                    discordTokenExpiresAt: tokenExpiresAt,
                    ...(shouldApprove ? { status: 'approved' as const } : {}),
                    updatedAt: new Date(),
                })
                .where(eq(users.id, existing[0].id))
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

        await upsertIdentity(userId, {
            provider: 'discord',
            subject: discordUser.id,
            username: discordUser.global_name ?? discordUser.username,
            avatarUrl: discordUser.avatar
                ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
                : null,
            accessToken: access_token,
            tokenExpiresAt: tokenExpiresAt,
        })

        if (shouldApprove && mappedRole) {
            await upsertProfile(userId, mappedRole, mappedGroupId)
        }

        const enriched = await fetchEnrichedUser(eq(users.id, userId))
        const token = await issueToken(enriched!)

        if (clientRedirectUri) {
            const url = new URL(clientRedirectUri)
            url.searchParams.set('token', token)
            return c.redirect(url.toString())
        }
        return c.json({ data: userToDto(enriched!), token }, 200)
    },
)

app.openapi(
    createRoute({
        method: 'get',
        path: '/discord/my-guilds',
        operationId: 'getMyGuilds',
        summary: "List the caller's Discord guilds",
        description:
            'Read live from Discord with the token stored at login; answers 400 once that token is gone.',
        tags: ['Auth'],
        security: [{ Bearer: [] }],
        middleware: [requireAuth] as const,
        responses: {
            200: dataResponse(z.array(MyGuildSchema), "User's Discord guilds"),
            400: errorResponse('No token stored'),
            401: errorResponse('Unauthorized'),
            502: errorResponse('Discord error'),
        },
    }),
    async (c) => {
        const payload = c.get('user')
        const [user] = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1)
        if (!user?.discordAccessToken) {
            return c.json(
                {
                    error: {
                        code: 'NO_TOKEN',
                        message: 'No Discord token stored. Please re-login.',
                    },
                },
                400,
            )
        }
        if (user.discordTokenExpiresAt && user.discordTokenExpiresAt < new Date()) {
            return c.json(
                {
                    error: {
                        code: 'TOKEN_EXPIRED',
                        message: 'Discord token expired. Please re-login.',
                    },
                },
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

        return c.json({ data: guildList.map(({ id, name, icon }) => ({ id, name, icon })) }, 200)
    },
)

app.openapi(
    createRoute({
        method: 'get',
        path: '/me',
        operationId: 'getMe',
        summary: 'Get the current user and refresh the token',
        tags: ['Auth'],
        security: [{ Bearer: [] }],
        middleware: [requireAuth] as const,
        responses: {
            200: jsonResponse(
                z.object({ data: UserDtoSchema, token: z.string() }),
                'Current user with refreshed token',
            ),
            401: errorResponse('Unauthorized'),
            404: errorResponse('Not found'),
        },
    }),
    async (c) => {
        const payload = c.get('user')
        const enriched = await fetchEnrichedUser(eq(users.id, payload.sub))
        if (!enriched) {
            return c.json({ error: { code: 'NOT_FOUND', message: 'User not found' } }, 404)
        }
        const token = await issueToken(enriched)
        return c.json({ data: userToDto(enriched), token }, 200)
    },
)

app.openapi(
    createRoute({
        method: 'patch',
        path: '/me/student-group',
        operationId: 'updateMyStudentGroup',
        summary: 'Choose your own student group',
        tags: ['Auth'],
        security: [{ Bearer: [] }],
        middleware: [requireAuth] as const,
        request: {
            body: {
                content: { 'application/json': { schema: StudentGroupBodySchema } },
                required: true,
            },
        },
        responses: {
            200: dataResponse(UserDtoSchema, 'Updated profile'),
            403: errorResponse('Forbidden'),
            404: errorResponse('Unknown group'),
        },
    }),
    async (c) => {
        const payload = c.get('user')
        const { studentGroupId } = c.req.valid('json')

        const target = await db.query.studentGroups.findFirst({
            where: eq(studentGroups.id, studentGroupId),
        })
        if (!target) {
            return c.json({ error: { code: 'NOT_FOUND', message: 'Group not found' } }, 404)
        }

        const [student] = await db
            .select()
            .from(userStudents)
            .where(eq(userStudents.userId, payload.sub))
        if (!student) {
            return c.json(
                {
                    error: {
                        code: 'NOT_A_STUDENT',
                        message: 'Only a student profile can pick a group',
                    },
                },
                403,
            )
        }

        // A Discord role can only map to the class staff knows about (S1), so a
        // student may move anywhere at or below it — including back up to it.
        const anchor = student.assignedGroupId ?? student.studentGroupId
        if (anchor && anchor !== studentGroupId) {
            const allowed = await getDescendantGroupIds(anchor)
            if (!allowed.has(studentGroupId)) {
                return c.json(
                    {
                        error: {
                            code: 'GROUP_NOT_ALLOWED',
                            message: 'Pick a subgroup of your own group, or ask an admin',
                        },
                    },
                    403,
                )
            }
        }

        await db
            .update(userStudents)
            .set({ studentGroupId })
            .where(eq(userStudents.userId, payload.sub))

        const enriched = await fetchEnrichedUser(eq(users.id, payload.sub))
        return c.json({ data: userToDto(enriched!) }, 200)
    },
)

// ---------------------------------------------------------------------------
// IUT — the department's LDAP↔OIDC bridge
// ---------------------------------------------------------------------------

const IUT_COOKIE = 'iut_oidc'
const IUT_FLOW_TTL_S = 600

type IutFlow = {
    /** PKCE verifier, nonce and state — all three have to survive the redirect. */
    v: string
    n: string
    s: string
    /** Where to hand the app token back, when the flow started from the SPA. */
    r?: string
    /** Set when an already-signed-in user is linking, rather than logging in. */
    u?: string
    exp: number
}

/**
 * The Discord flow is stateless — its `state` is a plain base64 blob — but PKCE
 * is not: the verifier must never reach the browser's URL. It rides in a signed,
 * HttpOnly cookie instead. `SameSite=Lax` is enough because the bridge sends the
 * user back with a top-level GET.
 */
async function setFlowCookie(c: Context, flow: Omit<IutFlow, 'exp'>): Promise<void> {
    const token = await sign(
        { ...flow, exp: Math.floor(Date.now() / 1000) + IUT_FLOW_TTL_S },
        config.jwt.secret,
        'HS256',
    )
    setCookie(c, IUT_COOKIE, token, {
        httpOnly: true,
        sameSite: 'Lax',
        secure: config.iut?.redirectUri.startsWith('https://') ?? true,
        path: '/',
        maxAge: IUT_FLOW_TTL_S,
    })
}

async function readFlowCookie(c: Context): Promise<IutFlow | null> {
    const raw = getCookie(c, IUT_COOKIE)
    if (!raw) return null
    deleteCookie(c, IUT_COOKIE, { path: '/' })
    try {
        return (await verify(raw, config.jwt.secret, 'HS256')) as IutFlow
    } catch {
        return null
    }
}

/** Role and anchor class for the `groups` the directory reports. */
async function resolveIutMapping(groups: string[]) {
    const wanted = [...new Set(groups.map((g) => g.toLowerCase()))]
    if (wanted.length === 0) return null
    const mappings = await db
        .select()
        .from(iutGroupMappings)
        .where(inArray(iutGroupMappings.claimValue, wanted))
    if (mappings.length === 0) return null

    // A teacher mapping wins: it is the narrower statement about the person.
    const teacher = mappings.find((m) => m.userRole === 'teacher')
    if (teacher) return { role: 'teacher' as const, groupId: null }
    const withGroup = mappings.find((m) => m.studentGroupId) ?? mappings[0]
    return { role: 'student' as const, groupId: withGroup.studentGroupId ?? null }
}

app.openapi(
    createRoute({
        method: 'get',
        path: '/iut',
        operationId: 'iutLogin',
        summary: 'Start the IUT OIDC flow',
        description:
            'Redirects to the department bridge with PKCE. Pass `token` to link the IUT account to the session it belongs to instead of signing in — the browser cannot send an Authorization header through a redirect, so the app token travels as a query parameter here, the way it already does on the way back.',
        tags: ['Auth'],
        request: {
            query: z.object({
                redirect_uri: z.string().url().optional(),
                token: z.string().optional(),
            }),
        },
        responses: {
            302: { description: 'Redirect to the IUT authorization endpoint' },
            401: errorResponse('Invalid link token'),
            503: errorResponse('IUT login is not configured'),
        },
    }),
    async (c) => {
        if (!config.iut) {
            return c.json(
                { error: { code: 'IUT_DISABLED', message: 'IUT login is not configured' } },
                503,
            )
        }

        let linkUserId: string | undefined
        const linkToken = c.req.query('token')
        if (linkToken) {
            try {
                const payload = (await verify(linkToken, config.jwt.secret, 'HS256')) as JwtPayload
                linkUserId = payload.sub
            } catch {
                return c.json(
                    { error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } },
                    401,
                )
            }
        }

        const { codeVerifier, codeChallenge, state, nonce } = createPkce()
        await setFlowCookie(c, {
            v: codeVerifier,
            n: nonce,
            s: state,
            r: safeRedirectUri(c.req.query('redirect_uri')),
            u: linkUserId,
        })
        return c.redirect(await buildAuthorizationUrl({ codeChallenge, state, nonce }))
    },
)

app.openapi(
    createRoute({
        method: 'get',
        path: '/iut/callback',
        operationId: 'iutCallback',
        summary: 'Finish the IUT OIDC flow',
        description:
            'Verifies the ID token, then either links the identity to the session that started the flow or upserts an account keyed on `preferred_username`. A `groups` claim matching an `iut_group_mappings` row auto-approves the user, exactly as a Discord role does.',
        tags: ['Auth'],
        request: {
            query: z.object({
                code: z.string().optional(),
                state: z.string().optional(),
                error: z.string().optional(),
            }),
        },
        responses: {
            302: { description: 'Redirect back to the client with the token' },
            200: jsonResponse(
                z.object({ data: UserDtoSchema, token: z.string() }),
                'Auth result (when no clientRedirectUri)',
            ),
            400: errorResponse('Auth error'),
            503: errorResponse('IUT login is not configured'),
        },
    }),
    async (c) => {
        if (!config.iut) {
            return c.json(
                { error: { code: 'IUT_DISABLED', message: 'IUT login is not configured' } },
                503,
            )
        }

        const flow = await readFlowCookie(c)
        const clientRedirectUri = flow?.r

        const fail = (code: string, message: string) => {
            if (clientRedirectUri) {
                const url = new URL(clientRedirectUri)
                url.searchParams.set('error', code)
                return c.redirect(url.toString())
            }
            return c.json({ error: { code, message } }, 400)
        }

        if (c.req.query('error')) return fail('iut_auth_failed', 'The bridge refused the request')
        if (!flow) return fail('iut_state_expired', 'Login took too long, please try again')
        const code = c.req.query('code')
        if (!code) return fail('missing_code', 'Missing authorization code')
        if (c.req.query('state') !== flow.s) return fail('iut_state_mismatch', 'State mismatch')

        let claims: IutClaims
        try {
            claims = await exchangeCode(code, flow.v, flow.n)
        } catch (err) {
            console.error('IUT token exchange failed', err)
            return fail(
                err instanceof OidcError ? 'iut_auth_failed' : 'iut_unreachable',
                'Could not verify the IUT login',
            )
        }

        const subject = iutSubject(claims)
        if (!subject) return fail('iut_no_subject', 'The bridge returned no usable identifier')

        const identity = {
            provider: 'iut' as const,
            subject,
            providerSubRaw: claims.sub ?? null,
            username: claims.name ?? subject,
            email: claims.email ?? null,
        }

        // Linking: attach the identity to the session that started the flow.
        if (flow.u) {
            const owner = await findUserIdByIdentity('iut', subject)
            if (owner && owner !== flow.u) {
                return fail('iut_already_linked', 'That IUT account belongs to another user')
            }
            await upsertIdentity(flow.u, identity)
            const linked = await fetchEnrichedUser(eq(users.id, flow.u))
            if (!linked) return fail('unknown_user', 'Unknown user')
            const token = await issueToken(linked)
            if (clientRedirectUri) {
                const url = new URL(clientRedirectUri)
                url.searchParams.set('token', token)
                return c.redirect(url.toString())
            }
            return c.json({ data: userToDto(linked), token }, 200)
        }

        const mapping = await resolveIutMapping(claims.groups ?? [])
        const existingId = await findUserIdByIdentity('iut', subject)
        const existing = existingId
            ? await db.select().from(users).where(eq(users.id, existingId)).limit(1)
            : []

        const wasAlreadyApproved = existing.length > 0 && existing[0].status === 'approved'
        // A directory group must never undo an admin's decision to reject someone.
        const wasRejected = existing.length > 0 && existing[0].status === 'rejected'
        const shouldApprove = !!mapping && !wasAlreadyApproved && !wasRejected

        let userId: string
        if (existing.length > 0) {
            await db
                .update(users)
                .set({
                    ...(shouldApprove ? { status: 'approved' as const } : {}),
                    updatedAt: new Date(),
                })
                .where(eq(users.id, existing[0].id))
            userId = existing[0].id
        } else {
            const [created] = await db
                .insert(users)
                .values({ status: mapping ? 'approved' : 'pending' })
                .returning({ id: users.id })
            userId = created.id
        }

        await upsertIdentity(userId, identity)
        if (shouldApprove && mapping) {
            await upsertProfile(userId, mapping.role, mapping.groupId)
        }

        const enriched = await fetchEnrichedUser(eq(users.id, userId))
        const token = await issueToken(enriched!)

        if (clientRedirectUri) {
            const url = new URL(clientRedirectUri)
            url.searchParams.set('token', token)
            return c.redirect(url.toString())
        }
        return c.json({ data: userToDto(enriched!), token }, 200)
    },
)

export default app
