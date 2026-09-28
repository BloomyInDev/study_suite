<script setup lang="ts">
import { computed } from 'vue'

/** The part of v-calendar's `#day-body` slot scope this needs. */
interface DayBodyScope {
    year: number
    month: number
    day: number
    timeToY: (time: number) => number | false
    intervalRange?: [number, number]
}

const props = defineProps<{
    day: DayBodyScope
    /** A wall-clock label from `wallClockNow()`, like the events on the grid. */
    now: Date
}>()

// The calendar was handed `toCalendarLocalDate`d dates, so the day it reports
// is the wall-clock day and compares against the label's UTC parts.
const top = computed(() => {
    const { year, month, day, timeToY, intervalRange } = props.day
    const now = props.now
    if (
        year !== now.getUTCFullYear() ||
        month !== now.getUTCMonth() + 1 ||
        day !== now.getUTCDate()
    ) {
        return null
    }
    const minutes = now.getUTCHours() * 60 + now.getUTCMinutes()
    if (!intervalRange || minutes < intervalRange[0] || minutes > intervalRange[1]) return null
    const y = timeToY(minutes)
    return y === false ? null : `${y}px`
})
</script>

<template>
    <div v-if="top !== null" class="current-time-line" :style="{ top }" />
</template>

<style scoped>
.current-time-line {
    position: absolute;
    left: -1px;
    right: 0;
    height: 2px;
    background-color: #ea4335;
    pointer-events: none;
    z-index: 3;
}
.current-time-line::before {
    content: '';
    position: absolute;
    left: -5px;
    top: -4px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background-color: inherit;
}
</style>
