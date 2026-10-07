import { onMounted, onUnmounted, ref } from 'vue'

/** A ticking `new Date()`. Read once, a current-time line freezes at the hour
 *  the page was opened. */
export function useNow(intervalMs = 60_000) {
    const now = ref(new Date())
    let tick: ReturnType<typeof setInterval> | null = null

    onMounted(() => {
        now.value = new Date()
        tick = setInterval(() => {
            now.value = new Date()
        }, intervalMs)
    })

    onUnmounted(() => {
        if (tick) clearInterval(tick)
    })

    return now
}
