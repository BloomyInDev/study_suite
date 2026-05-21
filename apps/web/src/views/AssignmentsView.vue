<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useGroupsStore } from '../stores/groups.js'
import { useNotificationsStore } from '../stores/notifications.js'
import type { Assignment } from '../lib/types.js'
import AssignmentCard from '../components/AssignmentCard.vue'
import AssignmentFormDialog from '../components/AssignmentFormDialog.vue'

const groups = useGroupsStore()
const notifs = useNotificationsStore()
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

const assignments = ref<Assignment[]>([])
const loading = ref(false)
const formOpen = ref(false)
const editingAssignment = ref<Assignment | null>(null)

function authHeader() {
    return { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
}

async function fetchAssignments() {
    const ids = groups.effectiveGroupIds
    if (ids.length === 0) return
    loading.value = true
    try {
        const params = new URLSearchParams({ groupIds: ids.join(',') })
        const res = await fetch(`${API_URL}/api/assignments?${params}`, { headers: authHeader() })
        if (!res.ok) throw new Error('fetch failed')
        const body = (await res.json()) as { data: Assignment[] }
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

const upcoming = computed(() =>
    assignments.value.filter((a) => new Date(a.dueDate).getTime() >= todayEnd),
)
const today = computed(() =>
    assignments.value.filter((a) => {
        const t = new Date(a.dueDate).getTime()
        return t >= todayStart && t < todayEnd
    }),
)
const past = computed(() =>
    assignments.value.filter((a) => new Date(a.dueDate).getTime() < todayStart),
)

function openCreate() {
    editingAssignment.value = null
    formOpen.value = true
}

function openEdit(a: Assignment) {
    editingAssignment.value = a
    formOpen.value = true
}

function onSaved(a: Assignment) {
    const idx = assignments.value.findIndex((x) => x.id === a.id)
    if (idx >= 0) assignments.value[idx] = a
    else assignments.value = [...assignments.value, a].sort(
        (x, y) => new Date(x.dueDate).getTime() - new Date(y.dueDate).getTime(),
    )
}

function onDeleted(id: string) {
    assignments.value = assignments.value.filter((a) => a.id !== id)
}

async function toggleDone(a: Assignment, done: boolean) {
    const method = done ? 'POST' : 'DELETE'
    try {
        const res = await fetch(`${API_URL}/api/assignments/${a.id}/complete`, {
            method,
            headers: authHeader(),
        })
        if (!res.ok) throw new Error()
        const body = (await res.json()) as { data: { completedByMe: boolean; completionCount: number } }
        const idx = assignments.value.findIndex((x) => x.id === a.id)
        if (idx >= 0) {
            assignments.value[idx] = {
                ...assignments.value[idx],
                completedByMe: body.data.completedByMe,
                completionCount: body.data.completionCount,
            }
        }
    } catch {
        notifs.error('Erreur lors de la mise à jour')
    }
}

onMounted(fetchAssignments)
</script>

<template>
    <v-container fluid class="pa-4">
        <div class="d-flex align-center mb-4">
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

        <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-4" />

        <template v-if="!loading">
            <template v-if="assignments.length === 0">
                <v-alert type="info" variant="tonal">Aucun devoir pour vos groupes.</v-alert>
            </template>

            <template v-else>
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
                            @click="openEdit(a)"
                            @toggle="toggleDone(a, $event)"
                        />
                    </v-list>
                </template>

                <template v-if="upcoming.length > 0">
                    <div class="text-subtitle-2 mb-1">
                        <v-icon size="16">mdi-calendar-arrow-right</v-icon>
                        À venir ({{ upcoming.length }})
                    </div>
                    <v-list density="compact" class="mb-3">
                        <AssignmentCard
                            v-for="a in upcoming"
                            :key="a.id"
                            :assignment="a"
                            @click="openEdit(a)"
                            @toggle="toggleDone(a, $event)"
                        />
                    </v-list>
                </template>

                <template v-if="past.length > 0">
                    <div class="text-subtitle-2 text-medium-emphasis mb-1">
                        <v-icon size="16">mdi-history</v-icon>
                        Passés ({{ past.length }})
                    </div>
                    <v-list density="compact">
                        <AssignmentCard
                            v-for="a in past"
                            :key="a.id"
                            :assignment="a"
                            @click="openEdit(a)"
                            @toggle="toggleDone(a, $event)"
                        />
                    </v-list>
                </template>
            </template>
        </template>

        <AssignmentFormDialog
            v-model="formOpen"
            :editing="editingAssignment"
            @saved="onSaved"
            @deleted="onDeleted"
        />
    </v-container>
</template>
