<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useGroupsStore } from '../stores/groups.js'
import { useEventsStore } from '../stores/events.js'
import { useAuthStore } from '../stores/auth.js'
import type { Event, Assignment } from '../lib/types.js'
import NoGroupsCard from '../components/NoGroupsCard.vue'
import NextEventCard from '../components/NextEventCard.vue'
import NoEventsCard from '../components/NoEventsCard.vue'
import AssignmentCard from '../components/AssignmentCard.vue'
import AssignmentFormDialog from '../components/AssignmentFormDialog.vue'
import GroupPickerDialog from '../components/GroupPickerDialog.vue'

const groupStore = useGroupsStore()
const eventsStore = useEventsStore()
const auth = useAuthStore()

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

const events = ref<Event[]>([])
const assignments = ref<Assignment[]>([])
const loading = ref(true)
const now = ref(new Date())
const pickerOpen = ref(false)
const assignmentFormOpen = ref(false)
let intervalId: ReturnType<typeof setInterval> | null = null

onMounted(async () => {
    loading.value = true
    try {
        const promises: Promise<void>[] = [
            eventsStore.fetchUpcoming(groupStore.effectiveGroupIds, 10).then((e) => {
                events.value = e
            }),
        ]
        if (auth.isAuthenticated && groupStore.effectiveGroupIds.length > 0) {
            const cutoff = new Date()
            cutoff.setDate(cutoff.getDate() + 14)
            const params = new URLSearchParams({
                groupIds: groupStore.effectiveGroupIds.join(','),
                to: cutoff.toISOString(),
            })
            promises.push(
                fetch(`${API_URL}/api/assignments?${params}`, {
                    headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
                })
                    .then((r) => (r.ok ? r.json() : { data: [] }))
                    .then((body: { data: Assignment[] }) => {
                        assignments.value = body.data.slice(0, 5)
                    })
                    .catch(() => {}),
            )
        }
        await Promise.all(promises)
    } finally {
        loading.value = false
    }
    intervalId = setInterval(() => {
        now.value = new Date()
    }, 5_000)
})

onUnmounted(() => {
    if (intervalId) clearInterval(intervalId)
})

const currentOrNextEvent = computed(() => {
    const sorted = [...events.value].sort((a, b) => a.start.getTime() - b.start.getTime())
    const current = sorted.find((e) => now.value >= e.start && now.value <= e.end)
    if (current) return { event: current, isCurrent: true }
    const next = sorted.find((e) => e.start > now.value)
    if (next) return { event: next, isCurrent: false }
    return null
})

const upcomingAssignments = computed(() =>
    assignments.value.filter((a) => new Date(a.dueDate) >= now.value),
)

function onAssignmentSaved(a: Assignment) {
    const idx = assignments.value.findIndex((x) => x.id === a.id)
    if (idx >= 0) assignments.value[idx] = a
    else assignments.value = [a, ...assignments.value].slice(0, 5)
}

async function toggleDone(a: Assignment, done: boolean) {
    const method = done ? 'POST' : 'DELETE'
    const res = await fetch(`${API_URL}/api/assignments/${a.id}/complete`, {
        method,
        headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
    })
    if (!res.ok) return
    const body = (await res.json()) as { data: { completedByMe: boolean; completionCount: number } }
    const idx = assignments.value.findIndex((x) => x.id === a.id)
    if (idx >= 0) {
        assignments.value[idx] = { ...assignments.value[idx], ...body.data }
    }
}
</script>

<template>
    <v-container>
        <GroupPickerDialog v-model="pickerOpen" />
        <v-row justify="center">
            <v-col cols="12" md="8" lg="6">
                <template v-if="loading">
                    <v-card class="text-center pa-8">
                        <v-progress-circular indeterminate color="primary" size="48" />
                    </v-card>
                </template>
                <template v-else-if="!groupStore.selectedGroupIds.length">
                    <NoGroupsCard @open-picker="pickerOpen = true" />
                </template>
                <template v-else-if="currentOrNextEvent">
                    <NextEventCard
                        :event="currentOrNextEvent.event"
                        :is-current="currentOrNextEvent.isCurrent"
                        :now="now"
                    />
                </template>
                <template v-else>
                    <NoEventsCard />
                </template>
            </v-col>

            <v-col
                v-if="auth.isAuthenticated && upcomingAssignments.length > 0"
                cols="12"
                md="8"
                lg="6"
            >
                <v-card>
                    <v-card-item>
                        <template #prepend>
                            <v-icon color="primary" size="32">mdi-book-edit</v-icon>
                        </template>
                        <v-card-title>Devoirs à venir</v-card-title>
                    </v-card-item>
                    <v-list density="compact">
                        <AssignmentCard
                            v-for="a in upcomingAssignments"
                            :key="a.id"
                            :assignment="a"
                            compact
                            @click="assignmentFormOpen = true"
                            @toggle="toggleDone(a, $event)"
                        />
                    </v-list>
                    <v-card-actions>
                        <v-btn
                            variant="flat"
                            color="primary"
                            to="/devoirs"
                            append-icon="mdi-arrow-right"
                        >
                            Tous les devoirs
                        </v-btn>
                    </v-card-actions>
                </v-card>
            </v-col>
        </v-row>

        <AssignmentFormDialog
            v-model="assignmentFormOpen"
            @saved="onAssignmentSaved"
            @deleted="(id) => (assignments = assignments.filter((a) => a.id !== id))"
        />
    </v-container>
</template>
