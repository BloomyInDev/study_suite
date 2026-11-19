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
 * Lets a teacher change the answer they gave the sign-in dialog
 * (TeacherIdentityDialog): pick someone else, or say they are not in the list.
 */
const auth = useAuthStore()
const notifs = useNotificationsStore()

const teachers = ref<TeacherChoice[]>([])
const loading = ref(false)
const saving = ref(false)
const draft = ref<string | null>(auth.user?.teacherId ?? null)

onMounted(async () => {
    loadNotListed()
    loading.value = true
    try {
        teachers.value = await fetchTeacherChoices()
    } finally {
        loading.value = false
    }
})

// A link made elsewhere (the dialog, an admin) shows up here too.
watch(
    () => auth.user?.teacherId,
    (id) => {
        draft.value = id ?? null
    },
)

const current = computed(() => teachers.value.find((t) => t.value === auth.user?.teacherId))
const notListed = computed(() => !auth.user?.teacherId && notListedFor.value === auth.user?.id)

async function save(teacherId: string | null) {
    if (!auth.token || !auth.user) return
    saving.value = true
    try {
        const user = await saveMyTeacher(teacherId)
        auth.setAuth(auth.token, user)
        setNotListed(user.id, teacherId === null)
        notifs.success(teacherId ? 'Enregistré' : "Noté : vous n'êtes pas dans la liste")
    } catch {
        notifs.error("Impossible d'enregistrer votre choix")
    } finally {
        saving.value = false
    }
}
</script>

<template>
    <v-card>
        <v-card-title>Qui êtes-vous ?</v-card-title>
        <v-card-subtitle>Votre nom dans le planning</v-card-subtitle>
        <v-card-text>
            <p class="text-body-2 mb-3">
                <template v-if="current">
                    Vous êtes <strong>{{ current.title }}</strong> : l'application affiche votre
                    emploi du temps et les devoirs de vos classes.
                </template>
                <template v-else-if="notListed">
                    Vous avez indiqué ne pas être dans la liste.
                </template>
                <template v-else>Vous n'avez pas encore choisi votre nom.</template>
            </p>
            <v-autocomplete
                v-model="draft"
                :items="teachers"
                :loading="loading"
                label="Votre nom"
                prepend-inner-icon="mdi-account-tie"
                variant="outlined"
                density="compact"
                hide-details
                class="mb-3"
            />
            <div class="d-flex flex-wrap ga-2">
                <v-btn
                    color="primary"
                    variant="flat"
                    size="small"
                    :loading="saving"
                    :disabled="!draft || draft === auth.user?.teacherId"
                    @click="save(draft)"
                >
                    Enregistrer
                </v-btn>
                <v-btn
                    variant="text"
                    size="small"
                    :disabled="saving || notListed"
                    @click="save(null)"
                >
                    Je ne suis pas dans cette liste
                </v-btn>
            </div>
        </v-card-text>
    </v-card>
</template>
