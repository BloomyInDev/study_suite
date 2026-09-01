<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useDisplay } from 'vuetify'
import { useEventsStore } from '../stores/events.js'
import { useGroupsStore } from '../stores/groups.js'
import { useGroupOverride } from '../lib/group-override.js'
import { groupLabel } from '../lib/group-label.js'
import type { Event } from '../lib/types.js'
import CalendarEvent from '../components/CalendarEvent.vue'
import {
    mondayOfWeek,
    nextDay,
    previousDay,
    toCalendarLocalDate,
    weekdayFormat,
} from '../lib/date.js'

const { mobile } = useDisplay()
const groups = useGroupsStore()
const override = useGroupOverride()

// A single v-model over the url: picking a group writes `?group=`, clearing it
// (or picking one's own class) removes it.
const pickedGroupIds = computed({
    get: () => override.pickedIds.value,
    set: (ids: string[]) => override.set(ids),
})
const eventsStore = useEventsStore()
const events = ref<Event[]>([])
const date = ref(new Date())
const loading = ref(false)

const onKeydown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') previous()
    else if (e.key === 'ArrowRight') next()
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))

watch(
    [() => override.groupIds.value, date],
    async ([newGroupIds, newDate], [oldGroupIds, oldDate]) => {
        if (newGroupIds.length === 0) {
            events.value = []
            return
        }
        // Paging within a week shows the same events; a group change never does.
        const sameGroups =
            oldGroupIds !== undefined &&
            oldGroupIds.length === newGroupIds.length &&
            newGroupIds.every((id) => oldGroupIds.includes(id))
        if (
            sameGroups &&
            oldDate &&
            mondayOfWeek(newDate as Date).getTime() === mondayOfWeek(oldDate as Date).getTime()
        )
            return
        loading.value = true
        try {
            events.value = await eventsStore.fetchWeekEvents(
                mondayOfWeek(newDate as Date),
                newGroupIds as string[],
            )
        } finally {
            loading.value = false
        }
    },
    { immediate: true, deep: true },
)

const calendarEvents = computed(() =>
    events.value.map((e) => ({
        name: e.title,
        start: toCalendarLocalDate(e.start),
        end: toCalendarLocalDate(e.end),
        color: 'primary',
        timed: true,
        full: e,
    })),
)

const previous = () => previousDay(date, mobile.value ? 1 : 7)
const next = () => nextDay(date, mobile.value ? 1 : 7)
const formatInterval = (ts: { hour: number }) => `${ts.hour}:00`
</script>

<template>
    <v-container fluid class="pa-4">
        <v-alert
            v-if="override.isActive.value"
            type="info"
            variant="tonal"
            density="compact"
            class="mb-4"
            icon="mdi-account-switch"
        >
            <div class="d-flex align-center ga-2 flex-wrap">
                <span>
                    Vous consultez le planning de
                    <strong>{{ override.labels.value.join(', ') }}</strong>
                    au lieu du vôtre.
                </span>
                <v-spacer />
                <v-btn size="small" variant="text" @click="override.clear()">
                    Revenir au mien
                </v-btn>
            </div>
        </v-alert>
        <v-alert
            v-else-if="override.unknownNames.value.length > 0"
            type="warning"
            variant="tonal"
            density="compact"
            class="mb-4"
        >
            Groupe introuvable : {{ override.unknownNames.value.join(', ') }}.
        </v-alert>
        <v-row align="center" class="mb-4">
            <v-col cols="12" md="4" class="d-flex align-center">
                <v-autocomplete
                    v-model="pickedGroupIds"
                    :items="groups.visibleGroups"
                    :item-title="groupLabel"
                    item-value="id"
                    label="Voir le planning de..."
                    multiple
                    chips
                    closable-chips
                    clearable
                    density="compact"
                    variant="outlined"
                    hide-details
                    style="max-width: 350px"
                />
            </v-col>
            <v-col md="4" class="d-flex justify-start justify-md-center align-center">
                <v-btn
                    variant="text"
                    :size="mobile ? 'small' : undefined"
                    @click="previous"
                    icon="mdi-chevron-left"
                />
                <v-btn variant="outlined" :class="mobile ? '' : 'mx-4'" @click="date = new Date()">
                    Aujourd'hui
                </v-btn>
                <v-btn
                    variant="text"
                    :size="mobile ? 'small' : undefined"
                    @click="next"
                    icon="mdi-chevron-right"
                />
            </v-col>
            <v-col cols="auto" md="4" class="d-flex justify-end ga-2">
                <v-tooltip text="Comparer" location="start">
                    <template #activator="{ props }">
                        <v-btn
                            v-bind="props"
                            variant="tonal"
                            to="/planning/compare"
                            icon="mdi-compare"
                            :size="mobile ? 'small' : undefined"
                        />
                    </template>
                </v-tooltip>
            </v-col>
        </v-row>
        <v-sheet class="position-relative d-flex flex-column" min-height="400">
            <v-progress-linear :active="loading" indeterminate color="primary" absolute top />
            <v-calendar
                class="flex-grow-1"
                :events="calendarEvents"
                :model-value="date"
                color="primary"
                :type="mobile ? 'day' : 'week'"
                :weekday-format="weekdayFormat"
                :weekdays="[1, 2, 3, 4, 5, 6]"
                :interval-format="formatInterval"
                :first-interval="7"
                :interval-count="13"
                event-overlap-mode="column"
            >
                <template #event="{ event }">
                    <CalendarEvent :event="event" />
                </template>
            </v-calendar>
        </v-sheet>
    </v-container>
</template>

<style scoped>
.position-relative {
    position: relative;
}
</style>
