import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export interface AuthUser {
    id: string
    discordId: string
    discordUsername: string
    discordAvatar: string | null
    role: 'student' | 'teacher' | null
    isAdmin: boolean
    status: 'pending' | 'approved' | 'rejected'
    studentGroupId: string | null
    teacherId: string | null
}

export const useAuthStore = defineStore('auth', () => {
    const token = ref<string | null>(localStorage.getItem('auth_token'))
    const user = ref<AuthUser | null>(JSON.parse(localStorage.getItem('auth_user') ?? 'null'))

    const isAuthenticated = computed(() => !!token.value && !!user.value)
    const isAdmin = computed(() => user.value?.isAdmin ?? false)
    const isPending = computed(() => user.value?.status === 'pending')
    const isApproved = computed(() => user.value?.status === 'approved')

    function setAuth(newToken: string, newUser: AuthUser) {
        token.value = newToken
        user.value = newUser
        localStorage.setItem('auth_token', newToken)
        localStorage.setItem('auth_user', JSON.stringify(newUser))
    }

    function logout() {
        token.value = null
        user.value = null
        localStorage.removeItem('auth_token')
        localStorage.removeItem('auth_user')
    }

    return { token, user, isAuthenticated, isAdmin, isPending, isApproved, setAuth, logout }
})
