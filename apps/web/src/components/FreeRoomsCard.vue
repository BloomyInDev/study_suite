<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { backend } from '../lib/api.js'
import { useEventsStore } from '../stores/events.js'
import type { Event, Room } from '../lib/types.js'
import { wallClockNow } from '../lib/date.js'

const eventsStore = useEventsStore()

const rooms = ref<Room[]>([])
const events = ref<Event[]>([])
const loading = ref(true)
// Wall-clock, so it can be compared with the event times; and ticking, so the
// list does not keep showing rooms whose next class has since started.
const now = ref(wallClockNow())
let tick: ReturnType<typeof setInterval> | null = null

// Online "rooms" are not somewhere you can go and sit.
const isPhysical = (name: string) => !/en ligne|distanciel|\bCEL\b/i.test(name)

onMounted(async () => {
    try {
        const [roomsRes, dayEvents] = await Promise.all([
            backend.api.rooms.$get(),
            // Every group's events: occupancy is not about the user's own classes.
            eventsStore.fetchDayEvents(wallClockNow(), []),
        ])
        rooms.value = (await roomsRes.json()).data
        events.value = dayEvents
    } finally {
        loading.value = false
    }
    tick = setInterval(() => {
        now.value = wallClockNow()
    }, 60_000)
})

onUnmounted(() => {
    if (tick) clearInterval(tick)
})

interface FreeRoom {
    room: Room
    /** When the next class starts there, or null if it stays free all day. */
    until: Date | null
}

const free = computed<FreeRoom[]>(() => {
    const t = now.value
    const result: FreeRoom[] = []

    for (const room of rooms.value) {
        if (!isPhysical(room.name)) continue
        const booked = events.value.filter((e) => e.rooms.some((r) => r.id === room.id))
        if (booked.some((e) => e.start <= t && e.end > t)) continue

        const upcoming = booked
            .filter((e) => e.start > t)
            .sort((a, b) => a.start.getTime() - b.start.getTime())
        result.push({ room, until: upcoming[0]?.start ?? null })
    }

    // Free for the longest first.
    return result.sort(
        (a, b) => (b.until?.getTime() ?? Infinity) - (a.until?.getTime() ?? Infinity),
    )
})

// UTC getters: both `now` and the event times carry the Paris hour as their UTC
// components, so the local getters would add the offset a second time.
const hhmm = (d: Date) =>
    `${String(d.getUTCHours()).padStart(2, '0')}h${String(d.getUTCMinutes()).padStart(2, '0')}`
</script>

<template>
    <v-card>
        <v-card-item>
            <template #prepend>
                <v-icon color="primary" size="32">mdi-door-open</v-icon>
            </template>
            <v-card-title>Salles libres</v-card-title>
            <v-card-subtitle>maintenant — {{ hhmm(now) }}</v-card-subtitle>
        </v-card-item>

        <v-card-text v-if="loading" class="text-center py-6">
            <v-progress-circular indeterminate color="primary" size="32" />
        </v-card-text>

        <v-card-text v-else-if="free.length === 0" class="text-medium-emphasis">
            Aucune salle libre pour le moment.
        </v-card-text>

        <v-list v-else density="compact" max-height="260" class="overflow-y-auto">
            <v-list-item v-for="{ room, until } in free" :key="room.id">
                <v-list-item-title>{{ room.name }}</v-list-item-title>
                <template #append>
                    <span class="text-caption text-medium-emphasis">
                        {{ until ? `jusqu'à ${hhmm(until)}` : 'reste de la journée' }}
                    </span>
                </template>
            </v-list-item>
        </v-list>
    </v-card>
</template>
