<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useDisplay } from 'vuetify'
import { useGroupsStore } from '../stores/groups.js'
import { useEventsStore } from '../stores/events.js'
import type { Event } from '../lib/types.js'
import CalendarEvent from '../components/CalendarEvent.vue'
import GroupPickerDialog from '../components/GroupPickerDialog.vue'
import { mondayOfWeek, nextDay, previousDay, toCalendarLocalDate, weekdayFormat } from '../lib/date.js'

const { mobile } = useDisplay()
const groups = useGroupsStore()
const eventsStore = useEventsStore()
const events = ref<Event[]>([])
const date = ref(new Date())
const loading = ref(false)
const pickerOpen = ref(false)

const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'ArrowLeft') previous()
  else if (e.key === 'ArrowRight') next()
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))

watch(
  [() => groups.selectedGroupIds, date],
  async ([newGroupIds, newDate], [_oldIds, oldDate]) => {
    if (newGroupIds.length === 0) { events.value = []; return }
    if (oldDate && mondayOfWeek(newDate as Date).getTime() === mondayOfWeek(oldDate as Date).getTime()) return
    loading.value = true
    try {
      events.value = await eventsStore.fetchWeekEvents(mondayOfWeek(newDate as Date), newGroupIds as string[])
    } finally {
      loading.value = false
    }
  },
  { immediate: true, deep: true },
)

const calendarEvents = computed(() =>
  events.value.map(e => ({
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
    <GroupPickerDialog v-model="pickerOpen" />
    <v-row align="center" class="mb-4">
      <v-col cols="4" class="d-none d-md-flex" />
      <v-col md="4" class="d-flex justify-start justify-md-center align-center">
        <v-btn variant="text" :size="mobile ? 'small' : undefined" @click="previous" icon="mdi-chevron-left" />
        <v-btn variant="outlined" :class="mobile ? '' : 'mx-4'" @click="date = new Date()">
          Aujourd'hui
        </v-btn>
        <v-btn variant="text" :size="mobile ? 'small' : undefined" @click="next" icon="mdi-chevron-right" />
      </v-col>
      <v-col cols="auto" md="4" class="d-flex justify-end ga-2">
        <v-tooltip text="Mes groupes" location="start">
          <template #activator="{ props }">
            <v-btn v-bind="props" variant="tonal" icon="mdi-account-group" :size="mobile ? 'small' : undefined" @click="pickerOpen = true" />
          </template>
        </v-tooltip>
        <v-tooltip text="Comparer" location="start">
          <template #activator="{ props }">
            <v-btn v-bind="props" variant="tonal" to="/planning/compare" icon="mdi-compare" :size="mobile ? 'small' : undefined" />
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
        :first-interval="6"
        :interval-count="14"
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
.position-relative { position: relative; }
</style>
