import { Hono } from 'hono'
import { sign } from 'hono/jwt'
import { eq, inArray } from 'drizzle-orm'
import { db } from '../db.js'
import { users, discordGuilds, discordRoleMappings } from '@studysuite/db'
import { config } from '../config.js'
import { requireAuth, type AuthEnv } from '../middleware/auth.js'

const DISCORD_API = 'https://discord.com/api/v10'

type DiscordTokenResponse = { access_token: string; token_type: string }
type DiscordUser = { id: string; username: string; avatar: string | null; global_name: string | null }
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

function userToDto(user: typeof users.$inferSelect) {
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

async function issueToken(user: typeof users.$inferSelect): Promise<string> {
  return sign({
    sub: user.id,
    discordId: user.discordId,
    isAdmin: user.isAdmin,
    status: user.status,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
  }, config.jwt.secret, 'HS256')
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
      scope: 'identify guilds.members.read',
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
    if (!tokenRes.ok) return errorResponse('discord_auth_failed', 'Discord token exchange failed')
    const { access_token } = await tokenRes.json() as DiscordTokenResponse

    // Fetch Discord user info
    const userRes = await fetch(`${DISCORD_API}/users/@me`, {
      headers: { Authorization: `Bearer ${access_token}` },
    })
    if (!userRes.ok) return errorResponse('discord_user_failed', 'Failed to fetch Discord user')
    const discordUser = await userRes.json() as DiscordUser

    // Fetch member roles from all configured guilds (in parallel)
    const guilds = await db.select().from(discordGuilds)
    const memberRoleResults = await Promise.all(
      guilds.map(async (guild) => {
        const res = await fetch(`${DISCORD_API}/users/@me/guilds/${guild.discordGuildId}/member`, {
          headers: { Authorization: `Bearer ${access_token}` },
        })
        if (!res.ok) return { guildDbId: guild.id, roles: [] as string[] }
        const member = await res.json() as DiscordMember
        return { guildDbId: guild.id, roles: member.roles ?? [] }
      }),
    )

    // Find valid role → class mappings across all guilds
    const allRoleIds = memberRoleResults.flatMap(r => r.roles)
    const mappings = allRoleIds.length > 0
      ? await db.select().from(discordRoleMappings)
          .where(inArray(discordRoleMappings.discordRoleId, allRoleIds))
      : []

    const validMappings = mappings.filter(m =>
      memberRoleResults.some(r => r.guildDbId === m.guildId && r.roles.includes(m.discordRoleId)),
    )

    const autoApproved = validMappings.length > 0
    const mappedGroupId = autoApproved ? validMappings[0].studentGroupId : null

    // Upsert user
    const existing = await db.select().from(users)
      .where(eq(users.discordId, discordUser.id))
      .limit(1)

    let user: typeof users.$inferSelect
    if (existing.length > 0) {
      const [updated] = await db.update(users)
        .set({
          discordUsername: discordUser.global_name ?? discordUser.username,
          discordAvatar: discordUser.avatar,
          ...(autoApproved && existing[0].status !== 'approved' ? {
            status: 'approved' as const,
            role: 'student' as const,
            studentGroupId: mappedGroupId,
          } : {}),
          updatedAt: new Date(),
        })
        .where(eq(users.discordId, discordUser.id))
        .returning()
      user = updated
    } else {
      const [created] = await db.insert(users).values({
        discordId: discordUser.id,
        discordUsername: discordUser.global_name ?? discordUser.username,
        discordAvatar: discordUser.avatar,
        status: autoApproved ? 'approved' : 'pending',
        role: autoApproved ? 'student' : null,
        studentGroupId: mappedGroupId,
      }).returning()
      user = created
    }

    const token = await issueToken(user)

    if (clientRedirectUri) {
      const url = new URL(clientRedirectUri)
      url.searchParams.set('token', token)
      return c.redirect(url.toString())
    }
    return c.json({ data: userToDto(user), token })
  })

  .get('/me', requireAuth, async (c) => {
    const payload = c.get('user')
    const [user] = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1)
    if (!user) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'User not found' } }, 404)
    }
    const token = await issueToken(user)
    return c.json({ data: userToDto(user), token })
  })
