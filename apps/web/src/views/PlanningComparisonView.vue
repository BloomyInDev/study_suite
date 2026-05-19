<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useGroupsStore } from '../stores/groups.js'
import { useEventsStore } from '../stores/events.js'
import { Duration, type Event } from '../lib/types.js'
import CalendarEvent from '../components/CalendarEvent.vue'
import { nextDay, previousDay, toCalendarLocalDate, weekdayFormat } from '../lib/date.js'

const groupsStore = useGroupsStore()
const eventsStore = useEventsStore()

const date = ref(new Date())
const comparisonGroupId = ref<string | null>(null)
const myEvents = ref<Event[]>([])
const otherEvents = ref<Event[]>([])
const loadingMy = ref(false)
const loadingOther = ref(false)

const INTERVAL_HEIGHT = 48

const groupsThatCanBeCompared = computed(() =>
  groupsStore.allGroups.filter(g => !groupsStore.selectedGroupIds.includes(g.id)),
)

const categories = computed(() => {
  const cats = ['Mon Planning']
  if (comparisonGroupId.value) {
    const g = groupsStore.allGroups.find(g => g.id === comparisonGroupId.value)
    cats.push(g?.internalName ?? 'Autre')
  }
  return cats
})

const transformEvents = (evts: Event[], category: string, color: string) =>
  evts.map(e => ({
    name: e.title,
    start: toCalendarLocalDate(e.start),
    end: toCalendarLocalDate(e.end),
    color,
    timed: true,
    full: e,
    category,
  }))

const allCalendarEvents = computed(() => [
  ...transformEvents(myEvents.value, 'Mon Planning', 'primary'),
  ...transformEvents(
    otherEvents.value,
    groupsStore.allGroups.find(g => g.id === comparisonGroupId.value)?.internalName ?? 'Autre',
    'secondary',
  ),
])

const loading = computed(() => loadingMy.value || loadingOther.value)

const nowY = computed(() => {
  const now = new Date()
  const minutesFromStart = (now.getHours() - 6) * 60 + now.getMinutes()
  if (minutesFromStart < 0 || now.getHours() >= 20) return '-10px'
  return `${(minutesFromStart / 60) * INTERVAL_HEIGHT}px`
})

const isToday = (dateStr: string) => {
  const [y, m, d] = dateStr.split('-').map(Number)
  const today = new Date()
  return y === today.getFullYear() && m === today.getMonth() + 1 && d === today.getDate()
}

watch(
  [date, () => groupsStore.effectiveGroupIds],
  async ([newDate, newGroupIds], _, onCleanup) => {
    let cancelled = false
    onCleanup(() => { cancelled = true })
    if ((newGroupIds as string[]).length === 0) { myEvents.value = []; return }
    loadingMy.value = true
    try {
      const evts = await eventsStore.fetchDayEvents(newDate as Date, newGroupIds as string[])
      if (!cancelled) myEvents.value = evts
    } finally {
      if (!cancelled) loadingMy.value = false
    }
  },
  { immediate: true },
)

watch(
  [date, comparisonGroupId],
  async ([newDate, newGroupId], _, onCleanup) => {
    let cancelled = false
    onCleanup(() => { cancelled = true })
    if (!newGroupId) { otherEvents.value = []; return }
    loadingOther.value = true
    try {
      const evts = await eventsStore.fetchEvents([newGroupId as string], Duration.DAY, newDate as Date)
      if (!cancelled) otherEvents.value = evts
    } finally {
      if (!cancelled) loadingOther.value = false
    }
  },
  { immediate: true },
)

const previous = () => previousDay(date, 1)
const next = () => nextDay(date, 1)
const formatInterval = (ts: { hour: number }) => `${ts.hour}:00`
</script>

<template>
  <v-container fluid class="pa-4">
    <v-row align="center" class="mb-4">
      <v-col cols="4" class="d-none d-md-flex" />
      <v-col cols="12" md="4" class="d-flex justify-center align-center">
        <v-btn icon variant="text" @click="previous"><v-icon>mdi-chevron-left</v-icon></v-btn>
        <v-btn variant="outlined" class="mx-2" @click="date = new Date()">Aujourd'hui</v-btn>
        <v-btn icon variant="text" @click="next"><v-icon>mdi-chevron-right</v-icon></v-btn>
      </v-col>
      <v-col cols="12" md="4" class="d-flex justify-center justify-md-end">
        <v-autocomplete
          v-model="comparisonGroupId"
          :items="groupsThatCanBeCompared"
          item-title="internalName"
          item-value="id"
          label="Comparer..."
          clearable
          density="compact"
          variant="outlined"
          hide-details
          style="max-width: 250px"
        />
      </v-col>
    </v-row>
    <v-row>
      <v-col cols="12">
        <v-sheet class="flex-grow-1 position-relative d-flex flex-column" min-height="600" border rounded>
          <v-progress-linear :active="loading" indeterminate color="primary" absolute top />
          <v-calendar
            class="flex-grow-1"
            :events="allCalendarEvents"
            :model-value="date"
            type="category"
            :categories="categories"
            :weekday-format="weekdayFormat"
            :interval-format="formatInterval"
            :first-interval="6"
            :interval-count="14"
            event-overlap-mode="column"
          >
            <template #event="{ event }">
              <CalendarEvent :event="event" />
            </template>
            <template #day-body="{ date: slotDate }">
              <template v-if="isToday(slotDate)">
                <div class="v-current-time" :style="{ top: nowY }" />
              </template>
            </template>
          </v-calendar>
        </v-sheet>
      </v-col>
    </v-row>
  </v-container>
</template>

<style scoped>
.position-relative { position: relative; }
.v-current-time {
  height: 2px;
  background-color: #ea4335;
  position: absolute;
  left: -1px;
  right: 0;
  pointer-events: none;
}
</style>
