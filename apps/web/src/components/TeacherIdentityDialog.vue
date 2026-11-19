<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
    fetchTeacherChoices,
    loadNotListed,
    notListedFor,
    saveMyTeacher,
    setNotListed,
    type TeacherChoice,
} from '../lib/teacher-identity.js'
import { useAuthStore } from '../stores/auth.js'
import { useNotificationsStore } from '../stores/notifications.js'

/**
 * Asks a teacher account which teacher of the planning it is, once, after
 * sign-in. Linking gives them their own timetable and their classes' homework.
 * The account picks for itself: the role is already vouched for, and a wrong
 * pick only narrows what it can do (see PATCH /api/auth/me/teacher). The
 * profile card (TeacherIdentityCard) changes the answer later.
 */
const auth = useAuthStore()
const notifs = useNotificationsStore()

// Client only: the server render has no account and no localStorage.
const mounted = ref(false)
onMounted(() => {
    loadNotListed()
    mounted.value = true
})

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
        notListedFor.value !== auth.user?.id,
)

const teachers = ref<TeacherChoice[]>([])
const loadingTeachers = ref(false)
const picked = ref<string | null>(null)
const saving = ref(false)

watch(
    open,
    async (isOpen) => {
        if (!isOpen || teachers.value.length > 0) return
        loadingTeachers.value = true
        try {
            teachers.value = await fetchTeacherChoices()
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
        auth.setAuth(auth.token, await saveMyTeacher(picked.value))
        notifs.success('Votre emploi du temps est maintenant le vôtre')
    } catch {
        notifs.error("Impossible d'enregistrer votre choix")
    } finally {
        saving.value = false
    }
}

function notInList() {
    if (auth.user) setNotListed(auth.user.id, true)
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
