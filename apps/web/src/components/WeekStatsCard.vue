<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useEventsStore } from '../stores/events.js'
import { useGroupsStore } from '../stores/groups.js'
import type { Event } from '../lib/types.js'

const eventsStore = useEventsStore()
const groups = useGroupsStore()

const events = ref<Event[]>([])
const loading = ref(true)

async function load() {
    try {
        events.value = await eventsStore.fetchWeekEvents(new Date(), groups.effectiveGroupIds)
    } finally {
        loading.value = false
    }
}

onMounted(() => void load())
// The hierarchy arrives after mount; reload when the ancestors join in.
watch(
    () => groups.effectiveGroupIds.join(','),
    () => void load(),
)

const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']

const stats = computed(() => {
    const now = new Date()
    const hours = (list: Event[]) =>
        list.reduce((sum, e) => sum + (e.end.getTime() - e.start.getTime()) / 3_600_000, 0)

    const perDay = new Map<number, Event[]>()
    for (const e of events.value) {
        const day = e.start.getDay()
        perDay.set(day, [...(perDay.get(day) ?? []), e])
    }
    let busiest: { day: number; hours: number } | null = null
    for (const [day, list] of perDay) {
        const h = hours(list)
        if (!busiest || h > busiest.hours) busiest = { day, hours: h }
    }

    return {
        total: hours(events.value),
        count: events.value.length,
        remaining: hours(events.value.filter((e) => e.end > now)),
        busiest,
    }
})

const fmt = (h: number) => {
    const whole = Math.floor(h)
    const minutes = Math.round((h - whole) * 60)
    return minutes === 0 ? `${whole}h` : `${whole}h${String(minutes).padStart(2, '0')}`
}
</script>

<template>
    <v-card>
        <v-card-item>
            <template #prepend>
                <v-icon color="primary" size="32">mdi-chart-donut</v-icon>
            </template>
            <v-card-title>Ma semaine</v-card-title>
        </v-card-item>

        <v-card-text v-if="loading" class="text-center py-6">
            <v-progress-circular indeterminate color="primary" size="32" />
        </v-card-text>

        <v-card-text v-else-if="stats.count === 0" class="text-medium-emphasis">
            Aucun cours cette semaine.
        </v-card-text>

        <v-card-text v-else>
            <v-row dense>
                <v-col cols="6" sm="3">
                    <div class="text-h5 font-weight-bold">{{ fmt(stats.total) }}</div>
                    <div class="text-caption text-medium-emphasis">de cours</div>
                </v-col>
                <v-col cols="6" sm="3">
                    <div class="text-h5 font-weight-bold">{{ stats.count }}</div>
                    <div class="text-caption text-medium-emphasis">séances</div>
                </v-col>
                <v-col cols="6" sm="3">
                    <div class="text-h5 font-weight-bold">{{ fmt(stats.remaining) }}</div>
                    <div class="text-caption text-medium-emphasis">restantes</div>
                </v-col>
                <v-col cols="6" sm="3">
                    <div class="text-h5 font-weight-bold text-capitalize">
                        {{ stats.busiest ? DAYS[stats.busiest.day] : '—' }}
                    </div>
                    <div class="text-caption text-medium-emphasis">
                        journée la plus chargée<template v-if="stats.busiest">
                            ({{ fmt(stats.busiest.hours) }})</template
                        >
                    </div>
                </v-col>
            </v-row>
        </v-card-text>
    </v-card>
</template>
