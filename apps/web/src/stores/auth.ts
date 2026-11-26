import { API_URL } from '../lib/api-url'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export type AuthProvider = 'discord' | 'iut'

export interface AuthIdentity {
    provider: AuthProvider
    /** Discord snowflake, or the LDAP uid the directory account is keyed on. */
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
    /** Absent on a user cached before the field existed: treat it as null. */
    termsAcceptedVersion?: string | null
}

type LegacyUser = Omit<AuthUser, 'displayName' | 'avatarUrl' | 'identities'> & {
    discordId: string
    discordUsername: string
    discordAvatar: string | null
}

/**
 * A user cached before identities existed carries Discord fields and no
 * `displayName`. Discarding it would sign everyone out for one navigation on
 * the deploy that ships this, because the route guard runs before `App.vue` can
 * `refresh()`. The old shape is converted instead, and `refresh()` replaces it
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

/** Whether a JWT's `exp` has passed. A token we cannot read counts as valid: the api decides. */
function isExpired(jwt: string): boolean {
    try {
        const payload = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
        return typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now()
    } catch {
        return false
    }
}

export const useAuthStore = defineStore('auth', () => {
    const token = ref<string | null>(localStorage.getItem('auth_token'))
    const user = ref<AuthUser | null>(readStoredUser())

    /**
     * Set when the session ended on its own (expired or revoked token) rather
     * than by a click on logout, so `App.vue` can ask the user to sign in
     * again. Without it the app went on as a visitor in silence while every
     * authenticated call answered 401.
     */
    const sessionExpired = ref(false)

    const isAuthenticated = computed(() => !!token.value && !!user.value)
    const isAdmin = computed(() => user.value?.isAdmin ?? false)
    const isPending = computed(() => user.value?.status === 'pending')
    const isApproved = computed(() => user.value?.status === 'approved')
    const isRejected = computed(() => user.value?.status === 'rejected')
    const isTeacher = computed(() => user.value?.role === 'teacher')
    /**
     * The `teachers` row a teacher account is linked to, which is their own
     * timetable. Null for an unlinked teacher: an admin makes the link by hand.
     */
    const ownTeacherId = computed(() => (isTeacher.value ? (user.value?.teacherId ?? null) : null))
    const hasProvider = (provider: AuthProvider) =>
        user.value?.identities.some((i) => i.provider === provider) ?? false

    /**
     * Whether `user` came from the api in this page load, rather than from
     * localStorage, which holds whatever was true at the last sign-in. Anything
     * that must not act on a stale profile (an admin may have linked a teacher
     * since) waits for it.
     */
    const userFresh = ref(false)

    function setAuth(newToken: string, newUser: AuthUser) {
        token.value = newToken
        user.value = newUser
        userFresh.value = true
        sessionExpired.value = false
        localStorage.setItem('auth_token', newToken)
        localStorage.setItem('auth_user', JSON.stringify(newUser))
    }

    async function refresh(): Promise<void> {
        if (!token.value) return
        const sent = token.value
        const res = await fetch(`${API_URL}/api/auth/me`, {
            headers: { Authorization: `Bearer ${sent}` },
        })
        noteResponse(res, sent)
        // Anything else (a 5xx, a deploy in progress) keeps the cached session.
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

    /** Drop a session the api no longer accepts, and say so. */
    function expire() {
        if (!token.value) return
        logout()
        sessionExpired.value = true
    }

    /**
     * Call with the response of any request that carried `sentToken`. A 401
     * means the api rejected that token. Comparing with the current one keeps
     * a slow request sent before a fresh sign-in from ending the new session.
     */
    function noteResponse(res: Response, sentToken: string | null) {
        if (res.status === 401 && sentToken && sentToken === token.value) expire()
    }

    // Caught before the first route guard runs, so a page that needs an
    // account sends to /login instead of rendering with a dead token.
    if (token.value && isExpired(token.value)) expire()

    return {
        token,
        user,
        userFresh,
        isAuthenticated,
        isAdmin,
        isPending,
        isApproved,
        isRejected,
        isTeacher,
        ownTeacherId,
        hasProvider,
        sessionExpired,
        setAuth,
        refresh,
        logout,
        expire,
        noteResponse,
    }
})
