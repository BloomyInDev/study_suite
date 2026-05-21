<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore, type AuthUser } from '../stores/auth.js'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

onMounted(async () => {
    const token = route.query.token as string | undefined
    if (!token) {
        router.replace('/login?error=missing_token')
        return
    }

    try {
        const res = await fetch(`${API_URL}/auth/me`, {
            headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) throw new Error('auth failed')
        const body = (await res.json()) as { data: AuthUser; token: string }
        auth.setAuth(body.token ?? token, body.data)
        router.replace(auth.isPending ? '/pending' : '/')
    } catch {
        router.replace('/login?error=auth_failed')
    }
})
</script>

<template>
    <v-container class="d-flex align-center justify-center" style="min-height: 80vh">
        <v-progress-circular indeterminate color="primary" size="48" />
    </v-container>
</template>
