<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue'
import { useDisplay } from 'vuetify'
import type { Event } from '../lib/types.js'
import CalendarEvent from './CalendarEvent.vue'
import CurrentTimeLine from './CurrentTimeLine.vue'
import {
    nextDay,
    previousDay,
    skipSunday,
    toCalendarLocalDate,
    weekdayFormat,
} from '../lib/date.js'
import { useNow } from '../lib/use-now.js'

const props = withDefaults(
    defineProps<{
        events: Event[]
        loading?: boolean
        /** Arrow keys page the week. Off for a second calendar on the same screen. */
        keyboardNav?: boolean
        height?: number | string
        minHeight?: number | string
    }>(),
    { loading: false, keyboardNav: true, height: undefined, minHeight: 400 },
)

const date = defineModel<Date>({ required: true })

const { mobile } = useDisplay()
const now = useNow()

// A Sunday renders as Mon–Sat of the ended week plus the next Monday, and pages
// a week away from what the parent fetches (see `skipSunday`). Snap whatever
// comes in, so no caller has to remember.
watch(
    date,
    (d) => {
        const snapped = skipSunday(d)
        if (snapped !== d) date.value = snapped
    },
    { immediate: true },
)

// See `toCalendarLocalDate`: the grid must get the same reading as the events.
const calendarDate = computed(() => toCalendarLocalDate(date.value))

const calendarEvents = computed(() =>
    props.events.map((e) => ({
        name: e.title,
        start: toCalendarLocalDate(e.start),
        end: toCalendarLocalDate(e.end),
        // The planning's own colour is the course's category; 'primary' is the
        // fallback for a row scraped before it was read.
        color: e.color ?? 'primary',
        timed: true,
        full: e,
    })),
)

const previous = () => previousDay(date, mobile.value ? 1 : 7)
const next = () => nextDay(date, mobile.value ? 1 : 7)
const formatInterval = (ts: { hour: number }) => `${ts.hour}:00`

const onKeydown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') previous()
    else if (e.key === 'ArrowRight') next()
}

onMounted(() => {
    if (props.keyboardNav) document.addEventListener('keydown', onKeydown)
})
onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
    <v-row align="center" class="mb-4">
        <v-col cols="12" md="4" class="d-flex align-center">
            <slot name="prepend" />
        </v-col>
        <v-col md="4" class="d-flex justify-start justify-md-center align-center">
            <v-btn
                variant="text"
                :size="mobile ? 'small' : undefined"
                @click="previous"
                icon="mdi-chevron-left"
            />
            <v-btn
                variant="outlined"
                :class="mobile ? '' : 'mx-4'"
                @click="date = skipSunday(new Date())"
            >
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
            <slot name="append" />
        </v-col>
    </v-row>
    <v-sheet class="position-relative d-flex flex-column" :height="height" :min-height="minHeight">
        <v-progress-linear :active="loading" indeterminate color="primary" absolute top />
        <v-calendar
            class="flex-grow-1"
            :events="calendarEvents"
            :model-value="calendarDate"
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
            <template #day-body="day">
                <CurrentTimeLine :day="day" :now="now" />
            </template>
        </v-calendar>
    </v-sheet>
</template>

<style scoped>
.position-relative {
    position: relative;
}
</style>
