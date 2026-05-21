<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useGroupsStore } from '../stores/groups.js'
import { useEventsStore } from '../stores/events.js'
import type { Event } from '../lib/types.js'
import NoGroupsCard from '../components/NoGroupsCard.vue'
import NextEventCard from '../components/NextEventCard.vue'
import NoEventsCard from '../components/NoEventsCard.vue'
import GroupPickerDialog from '../components/GroupPickerDialog.vue'

const groupStore = useGroupsStore()
const eventsStore = useEventsStore()
const events = ref<Event[]>([])
const loading = ref(true)
const now = ref(new Date())
const pickerOpen = ref(false)
let intervalId: ReturnType<typeof setInterval> | null = null

onMounted(async () => {
    loading.value = true
    try {
        events.value = await eventsStore.fetchUpcoming(groupStore.effectiveGroupIds, 10)
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
        </v-row>
    </v-container>
</template>
