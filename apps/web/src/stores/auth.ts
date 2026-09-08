import { API_URL } from '../lib/api-url'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export type AuthProvider = 'discord' | 'iut'

export interface AuthIdentity {
    provider: AuthProvider
    /** Discord snowflake, or the LDAP uid the Dép. Info. account is keyed on. */
    subject: string
    username: string | null
    avatarUrl: string | null
}

export interface AuthUser {
    id: string
    displayName: string
    avatarUrl: string | null
    identities: AuthIdentity[]
    role: 'student' | 'teacher' | null
    isAdmin: boolean
    status: 'pending' | 'approved' | 'rejected'
    studentGroupId: string | null
    assignedGroupId: string | null
    teacherId: string | null
}

type LegacyUser = Omit<AuthUser, 'displayName' | 'avatarUrl' | 'identities'> & {
    discordId: string
    discordUsername: string
    discordAvatar: string | null
}

/**
 * A user cached before identities existed carries Discord fields and no
 * `displayName`. Discarding it would sign everyone out for one navigation on
 * the deploy that ships this — the route guard runs before `App.vue` can
 * `refresh()` — so the old shape is converted instead. `refresh()` replaces it
 * with the server's version a moment later.
 */
function readStoredUser(): AuthUser | null {
    const stored = JSON.parse(localStorage.getItem('auth_user') ?? 'null')
    if (!stored) return null
    if (Array.isArray(stored.identities)) return stored as AuthUser
    const legacy = stored as LegacyUser
    if (!legacy.discordId) return null
    const avatarUrl = legacy.discordAvatar
        ? `https://cdn.discordapp.com/avatars/${legacy.discordId}/${legacy.discordAvatar}.png`
        : null
    return {
        ...legacy,
        displayName: legacy.discordUsername,
        avatarUrl,
        identities: [
            {
                provider: 'discord',
                subject: legacy.discordId,
                username: legacy.discordUsername,
                avatarUrl,
            },
        ],
    }
}

export const useAuthStore = defineStore('auth', () => {
    const token = ref<string | null>(localStorage.getItem('auth_token'))
    const user = ref<AuthUser | null>(readStoredUser())

    const isAuthenticated = computed(() => !!token.value && !!user.value)
    const isAdmin = computed(() => user.value?.isAdmin ?? false)
    const isPending = computed(() => user.value?.status === 'pending')
    const isApproved = computed(() => user.value?.status === 'approved')
    const isRejected = computed(() => user.value?.status === 'rejected')
    const hasProvider = (provider: AuthProvider) =>
        user.value?.identities.some((i) => i.provider === provider) ?? false

    function setAuth(newToken: string, newUser: AuthUser) {
        token.value = newToken
        user.value = newUser
        localStorage.setItem('auth_token', newToken)
        localStorage.setItem('auth_user', JSON.stringify(newUser))
    }

    async function refresh(): Promise<void> {
        if (!token.value) return
        const res = await fetch(`${API_URL}/api/auth/me`, {
            headers: { Authorization: `Bearer ${token.value}` },
        })
        if (!res.ok) return
        const { data, token: newToken } = await res.json()
        setAuth(newToken, data)
    }

    function logout() {
        token.value = null
        user.value = null
        localStorage.removeItem('auth_token')
        localStorage.removeItem('auth_user')
    }

    return {
        token,
        user,
        isAuthenticated,
        isAdmin,
        isPending,
        isApproved,
        isRejected,
        hasProvider,
        setAuth,
        refresh,
        logout,
    }
})
