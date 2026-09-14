<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useEventsStore } from '../stores/events.js'
import { useGroupsStore } from '../stores/groups.js'
import type { Event, Group } from '../lib/types.js'
import { formatTime, wallClockNow } from '../lib/date.js'
import { groupLabel } from '../lib/group-label.js'

const eventsStore = useEventsStore()
const groupsStore = useGroupsStore()

const events = ref<Event[]>([])
const loading = ref(true)
const search = ref('')
// Wall-clock, so it can be compared with the event times.
const now = ref(wallClockNow())
let tick: ReturnType<typeof setInterval> | null = null

// The store caches a day for five minutes, so calling this every tick picks up
// scraper changes without hammering the api, and rolls over at midnight.
async function load() {
    now.value = wallClockNow()
    events.value = await eventsStore.fetchDayEvents(now.value, [])
}

onMounted(async () => {
    try {
        if (groupsStore.allGroups.length === 0) await groupsStore.fetchAll()
        await load()
    } finally {
        loading.value = false
    }
    tick = setInterval(() => void load(), 60_000)
})

onUnmounted(() => {
    if (tick) clearInterval(tick)
})

interface GroupNow {
    group: Group
    current: Event[]
    /** The next class today, shown only when nothing is running. */
    next: Event | null
}

const board = computed<GroupNow[]>(() => {
    const t = now.value
    const q = search.value.trim().toLowerCase()

    return groupsStore.visibleGroups
        .filter((g) => !q || groupLabel(g).toLowerCase().includes(q))
        .map((group) => {
            // A promo-wide lecture is tagged on the parent, not on the TD group.
            const ids = groupsStore.withAncestors([group.id])
            const own = events.value
                .filter((e) => e.groups.some((g) => ids.includes(g.id)))
                .sort((a, b) => a.start.getTime() - b.start.getTime())
            return {
                group,
                current: own.filter((e) => e.start <= t && e.end > t),
                next: own.find((e) => e.start > t) ?? null,
            }
        })
        .sort((a, b) =>
            groupLabel(a.group).localeCompare(groupLabel(b.group), 'fr', { numeric: true }),
        )
})
</script>

<template>
    <v-container fluid class="pa-4">
        <v-row class="mb-4" align="center">
            <v-col cols="12" md="6" class="d-flex ga-2 align-center flex-wrap">
                <v-text-field
                    v-model="search"
                    prepend-inner-icon="mdi-magnify"
                    label="Rechercher un groupe"
                    variant="outlined"
                    density="compact"
                    hide-details
                    clearable
                    style="max-width: 280px"
                />
                <span class="text-medium-emphasis">En ce moment : {{ formatTime(now) }}</span>
            </v-col>
        </v-row>

        <div v-if="loading" class="d-flex justify-center pa-8">
            <v-progress-circular indeterminate color="primary" size="48" />
        </div>

        <v-row v-else>
            <v-col
                v-for="{ group, current, next } in board"
                :key="group.id"
                cols="12"
                sm="6"
                md="4"
                lg="3"
            >
                <v-card height="100%" :color="current.length ? 'primary' : undefined">
                    <v-card-title>{{ groupLabel(group) }}</v-card-title>
                    <v-card-text v-if="current.length">
                        <div v-for="event in current" :key="event.id" class="mb-2">
                            <div class="font-weight-bold text-truncate">{{ event.title }}</div>
                            <div class="d-flex align-center">
                                <v-icon size="16" class="mr-1">mdi-clock-outline</v-icon>
                                {{ formatTime(event.start) }} - {{ formatTime(event.end) }}
                            </div>
                            <div v-if="event.rooms.length" class="d-flex align-center">
                                <v-icon size="16" class="mr-1">mdi-map-marker</v-icon>
                                {{ event.rooms.map((r) => r.name).join(', ') }}
                            </div>
                            <div v-if="event.teachers.length" class="d-flex align-center">
                                <v-icon size="16" class="mr-1">mdi-account-tie</v-icon>
                                {{
                                    event.teachers
                                        .map((t) => `${t.firstName} ${t.lastName}`)
                                        .join(', ')
                                }}
                            </div>
                        </div>
                    </v-card-text>
                    <v-card-text v-else class="text-medium-emphasis">
                        Pas de cours
                        <template v-if="next">
                            · prochain à {{ formatTime(next.start) }} ({{ next.title }})
                        </template>
                    </v-card-text>
                </v-card>
            </v-col>
            <v-col v-if="board.length === 0" cols="12">
                <v-alert type="info" variant="tonal">Aucun groupe trouvé.</v-alert>
            </v-col>
        </v-row>
    </v-container>
</template>
