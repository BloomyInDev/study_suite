<script setup lang="ts">
import { API_URL } from '../lib/api-url'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useGroupsStore } from '../stores/groups.js'
import { useEventsStore } from '../stores/events.js'
import { useAuthStore } from '../stores/auth.js'
import { mondayOfWeek, toWallClock } from '../lib/date.js'
import type { Event, Assignment } from '../lib/types.js'
import NoGroupsCard from '../components/NoGroupsCard.vue'
import NextEventCard from '../components/NextEventCard.vue'
import NoEventsCard from '../components/NoEventsCard.vue'
import AssignmentCard from '../components/AssignmentCard.vue'
import AssignmentDetailDialog from '../components/AssignmentDetailDialog.vue'
import GroupPickerDialog from '../components/GroupPickerDialog.vue'
import WeekStatsCard from '../components/WeekStatsCard.vue'
import FreeRoomsCard from '../components/FreeRoomsCard.vue'

const groupStore = useGroupsStore()
const eventsStore = useEventsStore()
const auth = useAuthStore()

const events = ref<Event[]>([])
const assignments = ref<Assignment[]>([])
const loading = ref(true)
// A real instant — assignment due dates are real instants too. Event times are
// not, so anything compared against those goes through `wallNow`.
const now = ref(new Date())
const pickerOpen = ref(false)
const detailOpen = ref(false)
const viewingAssignment = ref<Assignment | null>(null)
let intervalId: ReturnType<typeof setInterval> | null = null

async function load() {
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
}

onMounted(() => {
    void load()
    intervalId = setInterval(() => {
        now.value = new Date()
    }, 5_000)
})

onUnmounted(() => {
    if (intervalId) clearInterval(intervalId)
})

const wallNow = computed(() => toWallClock(now.value))

/** The api hands back the next events whenever they fall, so out of term the
 *  card happily announced a course a fortnight away as what is coming up. */
const endOfWeek = computed(() => {
    const end = mondayOfWeek(wallNow.value)
    end.setUTCDate(end.getUTCDate() + 7)
    return end
})

const currentOrNextEvent = computed(() => {
    const sorted = [...events.value]
        .filter((e) => e.start < endOfWeek.value)
        .sort((a, b) => a.start.getTime() - b.start.getTime())
    const current = sorted.find((e) => wallNow.value >= e.start && wallNow.value <= e.end)
    if (current) return { event: current, isCurrent: true }
    const next = sorted.find((e) => e.start > wallNow.value)
    if (next) return { event: next, isCurrent: false }
    return null
})

const upcomingAssignments = computed(() =>
    assignments.value.filter((a) => new Date(a.dueDate) >= now.value),
)

/** The homepage lists what is left to do; the homework page shows everything. */
const todoAssignments = computed(() => upcomingAssignments.value.filter((a) => !a.completedByMe))
const doneCount = computed(() => upcomingAssignments.value.length - todoAssignments.value.length)

// allGroups loads after mount, so the ancestors — and with them the promo's
// events — only join effectiveGroupIds a moment later.
watch(
    () => groupStore.effectiveGroupIds.join(','),
    () => void load(),
)

function openDetail(a: Assignment) {
    viewingAssignment.value = a
    detailOpen.value = true
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
        const updated = { ...assignments.value[idx], ...body.data }
        assignments.value[idx] = updated
        if (viewingAssignment.value?.id === updated.id) viewingAssignment.value = updated
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
                <template v-else-if="!groupStore.activeGroupIds.length">
                    <NoGroupsCard @open-picker="pickerOpen = true" />
                </template>
                <template v-else-if="currentOrNextEvent">
                    <NextEventCard
                        :event="currentOrNextEvent.event"
                        :is-current="currentOrNextEvent.isCurrent"
                        :now="wallNow"
                    />
                </template>
                <template v-else>
                    <NoEventsCard />
                </template>
            </v-col>

            <!-- Shown even with nothing due, so the card can say so. Gated on
                 having a group because that is what decides whether assignments
                 were fetched at all: without one, empty means unasked. -->
            <v-col
                v-if="auth.isAuthenticated && groupStore.effectiveGroupIds.length > 0"
                cols="12"
                md="8"
                lg="6"
            >
                <v-card>
                    <v-card-item>
                        <template #prepend>
                            <v-icon color="primary" size="32">mdi-book-edit</v-icon>
                        </template>
                        <v-card-title>Devoirs à faire</v-card-title>
                        <v-card-subtitle v-if="doneCount > 0">
                            {{ doneCount }} déjà fait{{ doneCount > 1 ? 's' : '' }}
                        </v-card-subtitle>
                    </v-card-item>
                    <v-card-text
                        v-if="todoAssignments.length === 0"
                        class="text-medium-emphasis d-flex align-center"
                    >
                        <v-icon color="success" class="mr-2">mdi-check-circle-outline</v-icon>
                        Rien à faire pour l'instant.
                    </v-card-text>
                    <v-list v-else density="compact">
                        <AssignmentCard
                            v-for="a in todoAssignments"
                            :key="a.id"
                            :assignment="a"
                            compact
                            @click="openDetail(a)"
                            @toggle="toggleDone(a, $event)"
                        />
                    </v-list>
                    <v-card-actions>
                        <v-btn
                            variant="flat"
                            color="primary"
                            to="/homework"
                            append-icon="mdi-arrow-right"
                        >
                            Tous les devoirs
                        </v-btn>
                    </v-card-actions>
                </v-card>
            </v-col>

            <v-col v-if="groupStore.selectedGroupIds.length > 0" cols="12" md="8" lg="6">
                <WeekStatsCard />
            </v-col>

            <v-col v-if="auth.isAuthenticated" cols="12" md="8" lg="6">
                <FreeRoomsCard />
            </v-col>
        </v-row>

        <AssignmentDetailDialog
            v-model="detailOpen"
            :assignment="viewingAssignment"
            @toggle="viewingAssignment && toggleDone(viewingAssignment, $event)"
        />
    </v-container>
</template>
