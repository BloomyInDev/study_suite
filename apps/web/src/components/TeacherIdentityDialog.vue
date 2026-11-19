<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { API_URL } from '../lib/api-url'
import { backend } from '../lib/api.js'
import { authHeaders } from '../lib/auth-headers.js'
import { useAuthStore } from '../stores/auth.js'
import { useNotificationsStore } from '../stores/notifications.js'
import type { AuthUser } from '../stores/auth.js'

/**
 * Asks a teacher account which teacher of the planning it is, once, after
 * sign-in. Linking gives them their own timetable and their classes' homework.
 * The account picks for itself: the role is already vouched for, and a wrong
 * pick only narrows what it can do (see PATCH /api/auth/me/teacher).
 *
 * "Not in the list" is remembered in this browser only, until the api keeps
 * the answer itself. An admin can still link the account from /admin/users.
 */
const auth = useAuthStore()
const notifs = useNotificationsStore()

const NOT_LISTED_KEY = 'study_suite_teacher_not_listed'

// Client only: the server render has no account and no localStorage.
const mounted = ref(false)
const notListed = ref(false)

function readNotListed(userId: string): boolean {
    try {
        return localStorage.getItem(NOT_LISTED_KEY) === userId
    } catch {
        return false
    }
}

onMounted(() => {
    mounted.value = true
})

watch(
    () => auth.user?.id,
    (id) => {
        notListed.value = id ? readNotListed(id) : false
    },
    { immediate: true },
)

const open = computed(
    () =>
        mounted.value &&
        // The cached profile may predate an admin linking the account: only
        // the one auth.refresh() fetched says whether it is still unlinked.
        auth.userFresh &&
        auth.isAuthenticated &&
        auth.isApproved &&
        auth.isTeacher &&
        !auth.user?.teacherId &&
        !notListed.value,
)

const teachers = ref<{ title: string; value: string }[]>([])
const loadingTeachers = ref(false)
const picked = ref<string | null>(null)
const saving = ref(false)

watch(
    open,
    async (isOpen) => {
        if (!isOpen || teachers.value.length > 0) return
        loadingTeachers.value = true
        try {
            const res = await backend.api.teachers.$get()
            const body = await res.json()
            teachers.value = body.data.map((t) => ({
                title: `${t.lastName} ${t.firstName}`,
                value: t.id,
            }))
        } finally {
            loadingTeachers.value = false
        }
    },
    { immediate: true },
)

async function confirm() {
    if (!picked.value || !auth.token) return
    saving.value = true
    try {
        const res = await fetch(`${API_URL}/api/auth/me/teacher`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ teacherId: picked.value }),
        })
        if (!res.ok) throw new Error('save failed')
        const body = (await res.json()) as { data: AuthUser }
        auth.setAuth(auth.token, body.data)
        notifs.success('Votre emploi du temps est maintenant le vôtre')
    } catch {
        notifs.error("Impossible d'enregistrer votre choix")
    } finally {
        saving.value = false
    }
}

function notInList() {
    const id = auth.user?.id
    if (!id) return
    try {
        localStorage.setItem(NOT_LISTED_KEY, id)
    } catch {
        // Storage blocked: the dialog closes for this page and comes back next time.
    }
    notListed.value = true
}
</script>

<template>
    <v-dialog :model-value="open" max-width="480" persistent>
        <v-card>
            <v-card-title class="pt-4 px-4">Qui êtes-vous ?</v-card-title>
            <v-card-text class="px-4">
                <p class="text-body-2 mb-4">
                    Choisissez votre nom dans la liste des enseignants du planning : l'application
                    vous montrera votre emploi du temps et les devoirs de vos classes.
                </p>
                <v-autocomplete
                    v-model="picked"
                    :items="teachers"
                    :loading="loadingTeachers"
                    label="Votre nom"
                    prepend-inner-icon="mdi-account-tie"
                    variant="outlined"
                    density="comfortable"
                    hide-details
                    autofocus
                />
            </v-card-text>
            <v-card-actions class="px-4 pb-4 flex-wrap ga-2">
                <v-btn variant="text" @click="notInList">Je ne suis pas dans cette liste</v-btn>
                <v-spacer />
                <v-btn
                    color="primary"
                    variant="flat"
                    :disabled="!picked"
                    :loading="saving"
                    @click="confirm"
                >
                    C'est moi
                </v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>
