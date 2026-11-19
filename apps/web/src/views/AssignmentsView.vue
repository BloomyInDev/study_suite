<script setup lang="ts">
import { API_URL } from '../lib/api-url'
import { authHeaders } from '../lib/auth-headers.js'
import { computed, onMounted, ref, watch } from 'vue'
import { useGroupsStore } from '../stores/groups.js'
import { useAuthStore } from '../stores/auth.js'
import { useNotificationsStore } from '../stores/notifications.js'
import type { Assignment } from '../lib/types.js'
import AssignmentCard from '../components/AssignmentCard.vue'
import AssignmentFormDialog from '../components/AssignmentFormDialog.vue'
import AssignmentDetailDialog from '../components/AssignmentDetailDialog.vue'

const groups = useGroupsStore()
const auth = useAuthStore()
const notifs = useNotificationsStore()
const showCompleted = ref(false)
const search = ref('')

const assignments = ref<Assignment[]>([])
const loading = ref(false)
const formOpen = ref(false)
const editingAssignment = ref<Assignment | null>(null)
const detailOpen = ref(false)
const viewingAssignment = ref<Assignment | null>(null)

// Bumped on every fetch, so a slower earlier response cannot overwrite a
// newer one (the ids change once the group graph arrives, see below).
let fetchSeq = 0

async function fetchAssignments() {
    // A teacher has no class of their own: naming no group asks the api for
    // everything they may read, every class for an unlinked teacher.
    const ids = auth.isTeacher ? [] : groups.effectiveGroupIds
    if (!auth.isTeacher && ids.length === 0) return
    const seq = ++fetchSeq
    loading.value = true
    try {
        const params = new URLSearchParams(ids.length > 0 ? { groupIds: ids.join(',') } : {})
        const res = await fetch(`${API_URL}/api/assignments?${params}`, { headers: authHeaders() })
        if (!res.ok) throw new Error('fetch failed')
        const body = (await res.json()) as { data: Assignment[] }
        if (seq !== fetchSeq) return
        assignments.value = body.data
    } catch {
        notifs.error('Erreur lors du chargement des devoirs')
    } finally {
        loading.value = false
    }
}

const now = new Date()
const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
const todayEnd = todayStart + 86400000

const filtered = computed(() => {
    const q = search.value.trim().toLowerCase()
    if (!q) return assignments.value
    return assignments.value.filter(
        (a) =>
            a.title.toLowerCase().includes(q) ||
            (a.subject ?? '').toLowerCase().includes(q) ||
            (a.description ?? '').toLowerCase().includes(q),
    )
})

const upcoming = computed(() =>
    filtered.value.filter((a) => new Date(a.dueDate).getTime() >= todayEnd),
)
const today = computed(() =>
    filtered.value.filter((a) => {
        const t = new Date(a.dueDate).getTime()
        return t >= todayStart && t < todayEnd
    }),
)
const past = computed(() =>
    filtered.value.filter(
        (a) => new Date(a.dueDate).getTime() < todayStart && !a.completedByMe,
    ),
)
const completedPast = computed(() =>
    filtered.value.filter(
        (a) => new Date(a.dueDate).getTime() < todayStart && a.completedByMe,
    ),
)

function openCreate() {
    editingAssignment.value = null
    formOpen.value = true
}

function openDetail(a: Assignment) {
    viewingAssignment.value = a
    detailOpen.value = true
}

function openEdit(a: Assignment) {
    editingAssignment.value = a
    detailOpen.value = false
    formOpen.value = true
}

function onSaved(a: Assignment) {
    const idx = assignments.value.findIndex((x) => x.id === a.id)
    if (idx >= 0) assignments.value[idx] = a
    else assignments.value = [...assignments.value, a].sort(
        (x, y) => new Date(x.dueDate).getTime() - new Date(y.dueDate).getTime(),
    )
    if (viewingAssignment.value?.id === a.id) viewingAssignment.value = a
}

function onDeleted(id: string) {
    assignments.value = assignments.value.filter((a) => a.id !== id)
}

async function toggleDone(a: Assignment, done: boolean) {
    const method = done ? 'POST' : 'DELETE'
    try {
        const res = await fetch(`${API_URL}/api/assignments/${a.id}/complete`, {
            method,
            headers: authHeaders(),
        })
        if (!res.ok) throw new Error()
        const body = (await res.json()) as { data: { completedByMe: boolean; completionCount: number } }
        const idx = assignments.value.findIndex((x) => x.id === a.id)
        if (idx >= 0) {
            const updated = {
                ...assignments.value[idx],
                completedByMe: body.data.completedByMe,
                completionCount: body.data.completionCount,
            }
            assignments.value[idx] = updated
            if (viewingAssignment.value?.id === updated.id) viewingAssignment.value = updated
        }
    } catch {
        notifs.error('Erreur lors de la mise à jour')
    }
}

onMounted(fetchAssignments)
// On a fresh load this view mounts before App.vue has fetched the group graph,
// so `effectiveGroupIds` is the class alone and homework set on its promo or
// semester is missing. Refetch once the ancestors are known, as HomeView does.
watch(
    () => groups.effectiveGroupIds.join(','),
    () => void fetchAssignments(),
)
</script>

<template>
    <v-container fluid class="pa-4">
        <div class="d-flex align-center mb-3">
            <div class="text-h6">Devoirs</div>
            <v-spacer />
            <v-btn
                color="primary"
                variant="tonal"
                prepend-icon="mdi-plus"
                size="small"
                @click="openCreate"
            >
                Nouveau
            </v-btn>
        </div>

        <div class="d-flex align-center ga-4 mb-4">
            <v-text-field
                v-model="search"
                prepend-inner-icon="mdi-magnify"
                placeholder="Rechercher…"
                variant="outlined"
                density="compact"
                hide-details
                clearable
                class="flex-grow-1"
            />
            <v-switch
                v-model="showCompleted"
                label="Complétés"
                color="success"
                density="compact"
                hide-details
                class="flex-shrink-0 mt-0"
                style="margin-bottom: 0"
            />
        </div>

        <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-4" />

        <template v-if="!loading">
            <template v-if="assignments.length === 0">
                <v-alert type="info" variant="tonal">{{
                    auth.isTeacher
                        ? 'Aucun devoir pour le moment.'
                        : 'Aucun devoir pour vos groupes.'
                }}</v-alert>
            </template>

            <template v-else>
                <template v-if="showCompleted && completedPast.length > 0">
                    <div class="text-subtitle-2 text-success mb-1">
                        <v-icon size="16" color="success">mdi-check-circle-outline</v-icon>
                        Complétés ({{ completedPast.length }})
                    </div>
                    <v-list density="compact" class="mb-3">
                        <AssignmentCard
                            v-for="a in completedPast"
                            :key="a.id"
                            :assignment="a"
                            @click="openDetail(a)"
                            @toggle="toggleDone(a, $event)"
                        />
                    </v-list>
                </template>

                <template v-if="past.length > 0">
                    <div class="text-subtitle-2 text-medium-emphasis mb-1">
                        <v-icon size="16">mdi-history</v-icon>
                        Passés ({{ past.length }})
                    </div>
                    <v-list density="compact" class="mb-3">
                        <AssignmentCard
                            v-for="a in past"
                            :key="a.id"
                            :assignment="a"
                            @click="openDetail(a)"
                            @toggle="toggleDone(a, $event)"
                        />
                    </v-list>
                </template>

                <template v-if="today.length > 0">
                    <div class="text-subtitle-2 text-warning mb-1">
                        <v-icon size="16" color="warning">mdi-clock-alert</v-icon>
                        Aujourd'hui ({{ today.length }})
                    </div>
                    <v-list density="compact" class="mb-3">
                        <AssignmentCard
                            v-for="a in today"
                            :key="a.id"
                            :assignment="a"
                            @click="openDetail(a)"
                            @toggle="toggleDone(a, $event)"
                        />
                    </v-list>
                </template>

                <template v-if="upcoming.length > 0">
                    <div class="text-subtitle-2 mb-1">
                        <v-icon size="16">mdi-calendar-arrow-right</v-icon>
                        À venir ({{ upcoming.length }})
                    </div>
                    <v-list density="compact">
                        <AssignmentCard
                            v-for="a in upcoming"
                            :key="a.id"
                            :assignment="a"
                            @click="openDetail(a)"
                            @toggle="toggleDone(a, $event)"
                        />
                    </v-list>
                </template>
            </template>
        </template>

        <AssignmentDetailDialog
            v-model="detailOpen"
            :assignment="viewingAssignment"
            @edit="openEdit(viewingAssignment!)"
            @toggle="viewingAssignment && toggleDone(viewingAssignment, $event)"
        />
        <AssignmentFormDialog
            v-model="formOpen"
            :editing="editingAssignment"
            @saved="onSaved"
            @deleted="onDeleted"
        />
    </v-container>
</template>
