import { ref, watch } from 'vue'

export type CalendarView = 'day' | 'week'

const KEY = 'study_suite_calendar_view'

function read(): CalendarView | null {
    try {
        const v = localStorage.getItem(KEY)
        return v === 'day' || v === 'week' ? v : null
    } catch {
        return null
    }
}

/**
 * Whether the screen is a phone held upright, the one case where the week's
 * six columns are too narrow to read and the calendar shows one day unless
 * told otherwise. Not Vuetify's `mobile`, which is anything under 1280px: a
 * phone held sideways or in desktop mode, or a tablet, would be stuck on one
 * day.
 */
export const isPortraitPhone = (width: number, height: number): boolean =>
    width < 600 && height > width

/**
 * The view the user picked with the toggle, or null to follow the width. Kept
 * per browser and shared by every calendar. Their pick wins even where the
 * week does not fit: a cramped week beats a view they cannot reach.
 */
const picked = ref<CalendarView | null>(read())

watch(picked, (v) => {
    try {
        if (v) localStorage.setItem(KEY, v)
        else localStorage.removeItem(KEY)
    } catch {
        // Private mode: the choice lasts for this page load only.
    }
})

export function usePickedCalendarView() {
    return picked
}
