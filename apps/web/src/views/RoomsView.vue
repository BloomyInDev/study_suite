<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { backend } from '../lib/api.js'
import type { Room, RoomWithDetails, Event } from '../lib/types.js'
import { enhanceEvent } from '../lib/types.js'
import { wallClockDayEnd, wallClockDayStart, wallClockNow } from '../lib/date.js'
import RoomCard from '../components/RoomCard.vue'
import RoomDetailsDialog from '../components/RoomDetailsDialog.vue'

const rooms = ref<Room[]>([])
const search = ref('')
const loading = ref(true)
const filterAvailable = ref(false)
const availableNow = ref<Set<string>>(new Set())
const loadingAvailable = ref(false)

const selectedRoom = ref<RoomWithDetails | null>(null)
const dialogOpen = ref(false)
const loadingDetails = ref(false)

const filtered = computed(() => {
    const q = search.value.trim().toLowerCase()
    let list = rooms.value
    if (filterAvailable.value) list = list.filter((r) => availableNow.value.has(r.id))
    if (q) list = list.filter((r) => r.name.toLowerCase().includes(q))
    return list
})

onMounted(async () => {
    try {
        const res = await backend.api.rooms.$get()
        const { data } = await res.json()
        rooms.value = data
    } finally {
        loading.value = false
    }
})

// Refetched on every switch-on: the answer is only true for the hour it asked
// about, and the old guard (`size === 0`) kept the first reply for the session.
watch(filterAvailable, async (val) => {
    if (!val) return
    loadingAvailable.value = true
    try {
        // The api compares these against wall-clock timestamps, so `now` has to
        // be in that encoding rather than a real instant.
        const now = wallClockNow()
        const to = new Date(now.getTime() + 3_600_000)
        const res = await backend.api.rooms.available.$get({
            query: { from: now.toISOString(), to: to.toISOString() },
        })
        const body = await res.json()
        const ids: string[] = (body.data ?? []).map((r) => r.id)
        availableNow.value = new Set(ids)
    } finally {
        loadingAvailable.value = false
    }
})

async function openRoom(room: Room) {
    dialogOpen.value = true
    loadingDetails.value = true
    selectedRoom.value = null
    try {
        const now = wallClockNow()
        const res = await backend.api.rooms[':id'].events.$get({
            param: { id: room.id },
            query: { from: wallClockDayStart(), to: wallClockDayEnd() },
        })
        const roomBody = await res.json()
        if (!('data' in roomBody)) throw new Error('Room not found')
        const todayEvents: Event[] = (roomBody.data ?? []).map(enhanceEvent)
        const available = !todayEvents.some((e) => now >= e.start && now <= e.end)
        selectedRoom.value = { ...room, available, todayEvents }
    } finally {
        loadingDetails.value = false
    }
}
</script>

<template>
    <v-container fluid class="pa-4">
        <v-row class="mb-4" align="center">
            <v-col cols="12" md="6" class="d-flex ga-2 align-center flex-wrap">
                <v-text-field
                    v-model="search"
                    prepend-inner-icon="mdi-magnify"
                    label="Rechercher une salle"
                    variant="outlined"
                    density="compact"
                    hide-details
                    clearable
                    style="max-width: 280px"
                />
                <v-switch
                    v-model="filterAvailable"
                    :loading="loadingAvailable"
                    label="Disponibles maintenant"
                    color="success"
                    density="compact"
                    hide-details
                    class="flex-shrink-0"
                />
            </v-col>
        </v-row>

        <div v-if="loading" class="d-flex justify-center pa-8">
            <v-progress-circular indeterminate color="primary" size="48" />
        </div>

        <v-row v-else>
            <v-col
                v-for="room in filtered"
                :key="room.id"
                cols="12"
                sm="6"
                md="4"
                lg="3"
                @click="openRoom(room)"
            >
                <RoomCard
                    :room="room"
                    :available="filterAvailable ? availableNow.has(room.id) : undefined"
                />
            </v-col>
            <v-col v-if="filtered.length === 0" cols="12">
                <v-alert type="info" variant="tonal">Aucune salle trouvée.</v-alert>
            </v-col>
        </v-row>

        <RoomDetailsDialog v-model="dialogOpen" :room="selectedRoom" :loading="loadingDetails" />
    </v-container>
</template>
