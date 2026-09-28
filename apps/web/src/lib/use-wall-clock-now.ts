import { onMounted, onUnmounted, ref } from 'vue'
import { wallClockNow } from './date.js'

/** A ticking `wallClockNow()`. Read once, a current-time line freezes at the
 *  hour the page was opened. */
export function useWallClockNow(intervalMs = 60_000) {
    const now = ref(wallClockNow())
    let tick: ReturnType<typeof setInterval> | null = null

    onMounted(() => {
        now.value = wallClockNow()
        tick = setInterval(() => {
            now.value = wallClockNow()
        }, intervalMs)
    })

    onUnmounted(() => {
        if (tick) clearInterval(tick)
    })

    return now
}
