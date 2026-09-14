<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useDisplay } from 'vuetify'
import { useEventsStore } from '../stores/events.js'
import type { Event, TeacherWithDetails } from '../lib/types.js'
import { formatTime, mondayOfWeek, wallClockNow } from '../lib/date.js'
import EventDetailsDialog from './EventDetailsDialog.vue'
import WeekCalendar from './WeekCalendar.vue'

const props = defineProps<{
    modelValue: boolean
    teacher: TeacherWithDetails | null
    loading: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const show = computed({
    get: () => props.modelValue,
    set: (v) => emit('update:modelValue', v),
})

const { mobile } = useDisplay()

// Wall-clock, like the event timestamps the api compares it to.
const weekDate = ref(wallClockNow())
const weekEvents = ref<Event[]>([])
const weekLoading = ref(false)
// Paging faster than the api answers would otherwise let an older week land last.
let requestId = 0

const eventsStore = useEventsStore()

async function loadWeek(teacherId: string, date: Date) {
    const token = ++requestId
    weekLoading.value = true
    try {
        const events = await eventsStore.fetchTeacherWeekEvents(teacherId, date)
        if (token !== requestId) return
        weekEvents.value = events ?? []
    } finally {
        if (token === requestId) weekLoading.value = false
    }
}

// Reopening lands on the current week rather than wherever the last teacher was
// left. It runs before the teacher itself arrives, so the fetch below sees it.
watch(
    () => props.modelValue,
    (open) => {
        if (open) weekDate.value = wallClockNow()
    },
)

watch([() => props.teacher?.id, weekDate], ([id, newDate], [oldId, oldDate]) => {
    if (!id) {
        requestId++
        weekEvents.value = []
        return
    }
    // On mobile the calendar pages a day at a time; the week it belongs to
    // is what the fetch covers.
    if (
        id === oldId &&
        oldDate &&
        mondayOfWeek(newDate).getTime() === mondayOfWeek(oldDate).getTime()
    )
        return
    void loadWeek(id, newDate)
})
</script>

<template>
    <v-dialog v-model="show" :max-width="1100" :fullscreen="mobile" scrollable>
        <v-card>
            <div v-if="loading" class="d-flex flex-column justify-center align-center pa-8">
                <v-progress-circular indeterminate color="primary" />
                <p class="text-center mt-2">Récupération des informations de l'enseignant</p>
            </div>
            <template v-else-if="teacher">
                <v-card-title class="text-h5 pt-4 px-4">
                    {{ teacher.firstName }} {{ teacher.lastName }}
                    <v-btn
                        icon="mdi-close"
                        variant="text"
                        size="small"
                        class="float-right"
                        @click="show = false"
                    />
                </v-card-title>
                <v-card-text class="pa-4">
                    <div class="mb-6">
                        <v-chip
                            :color="teacher.available ? 'success' : 'error'"
                            class="font-weight-bold"
                        >
                            {{
                                teacher.available
                                    ? 'Actuellement disponible'
                                    : 'Actuellement en cours'
                            }}
                        </v-chip>
                    </div>
                    <div v-if="teacher.currentEvent" class="mb-6">
                        <h3 class="text-h6 mb-2 text-primary">Cours actuel</h3>
                        <EventDetailsDialog :event="teacher.currentEvent">
                            <template #activator="{ props: aProps }">
                                <v-card
                                    v-bind="aProps"
                                    variant="tonal"
                                    color="primary"
                                    class="pa-2 cursor-pointer"
                                    link
                                >
                                    <v-card-item>
                                        <template #title>{{
                                            teacher.currentEvent!.title
                                        }}</template>
                                        <template #subtitle>
                                            <div class="d-flex align-center mt-1">
                                                <v-icon
                                                    icon="mdi-map-marker"
                                                    size="small"
                                                    class="mr-1"
                                                />
                                                {{
                                                    teacher
                                                        .currentEvent!.rooms.map((r) => r.name)
                                                        .join(', ')
                                                }}
                                            </div>
                                            <div class="d-flex align-center mt-1">
                                                <v-icon
                                                    icon="mdi-clock-outline"
                                                    size="small"
                                                    class="mr-1"
                                                />
                                                {{ formatTime(teacher.currentEvent!.start) }} -
                                                {{ formatTime(teacher.currentEvent!.end) }}
                                            </div>
                                        </template>
                                    </v-card-item>
                                </v-card>
                            </template>
                        </EventDetailsDialog>
                    </div>
                    <h3 class="text-h6 mb-2 text-primary">Planning de la semaine</h3>
                    <WeekCalendar
                        v-model="weekDate"
                        :events="weekEvents"
                        :loading="weekLoading"
                        :height="mobile ? undefined : 560"
                        :min-height="mobile ? 400 : undefined"
                    />
                </v-card-text>
            </template>
        </v-card>
    </v-dialog>
</template>
