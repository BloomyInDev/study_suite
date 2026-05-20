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
    const params = new URLSearchParams({
      client_id: config.discord.clientId,
      redirect_uri: config.discord.redirectUri,
      response_type: 'code',
      scope: 'identify guilds.members.read',
    })
    return c.redirect(`https://discord.com/api/oauth2/authorize?${params}`)
  })

  .get('/discord/callback', async (c) => {
    const code = c.req.query('code')
    if (!code) {
      return c.redirect(`${config.server.frontendUrl}/login?error=missing_code`)
    }

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
    if (!tokenRes.ok) {
      return c.redirect(`${config.server.frontendUrl}/login?error=discord_auth_failed`)
    }
    const { access_token } = await tokenRes.json() as DiscordTokenResponse

    // Fetch Discord user info
    const userRes = await fetch(`${DISCORD_API}/users/@me`, {
      headers: { Authorization: `Bearer ${access_token}` },
    })
    if (!userRes.ok) {
      return c.redirect(`${config.server.frontendUrl}/login?error=discord_user_failed`)
    }
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

    // Find matching role → class mappings across all guilds
    const allRoleIds = memberRoleResults.flatMap(r => r.roles)
    const mappings = allRoleIds.length > 0
      ? await db.select().from(discordRoleMappings)
          .where(inArray(discordRoleMappings.discordRoleId, allRoleIds))
      : []

    // Filter: mapping must belong to a guild where the user actually has that role
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
    return c.redirect(`${config.server.frontendUrl}/auth/callback?token=${token}`)
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
