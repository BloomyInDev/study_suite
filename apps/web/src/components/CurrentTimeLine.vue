<script setup lang="ts">
import { computed } from 'vue'
import { parisParts } from '../lib/date.js'

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
    now: Date
}>()

// The calendar was handed `toCalendarLocalDate`d dates, so the day it reports
// is the Paris day.
const top = computed(() => {
    const { year, month, day, timeToY, intervalRange } = props.day
    const now = parisParts(props.now)
    if (year !== now.year || month !== now.month || day !== now.day) return null
    const minutes = now.hour * 60 + now.minute
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
