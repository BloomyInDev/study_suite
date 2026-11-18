import { MAX_HIDDEN_COURSES } from '@studysuite/shared/hidden-courses'
import { defineStore } from 'pinia'
import { computed, ref, type InjectionKey, type Ref } from 'vue'

const LS_KEY = 'study_suite_hidden_courses'

/**
 * Provided by a view showing the student's own planning, so the event dialog
 * offers "Masquer ce cours" there and nowhere else: hiding a course from a
 * teacher's or a room's timetable would do nothing visible.
 */
export const CAN_HIDE_COURSES: InjectionKey<Readonly<Ref<boolean>>> = Symbol('canHideCourses')

function storedTitles(): string[] {
    try {
        const raw = localStorage.getItem(LS_KEY)
        return raw ? (JSON.parse(raw) as string[]) : []
    } catch {
        return []
    }
}

/**
 * Courses the student hid from their own planning, by exact title: every
 * "Anglais" goes, "Anglais - Test" stays until hidden too. Per browser, like a
 * visitor's group selection. The api does the filtering (`excludeTitle`), so a
 * hidden course does not use up the homepage's "next events" either.
 */
export const useHiddenCoursesStore = defineStore('hiddenCourses', () => {
    const titles = ref<string[]>(storedTitles())

    /** Stable across reorderings, for watchers and cache keys. */
    const key = computed(() => titles.value.join('\n'))

    function save(next: string[]) {
        titles.value = [...new Set(next)].sort((a, b) => a.localeCompare(b, 'fr'))
        try {
            localStorage.setItem(LS_KEY, JSON.stringify(titles.value))
        } catch {
            // Private mode: the choice lasts until the tab closes.
        }
    }

    /** At the api's limit: one more and every planning request answers 400. */
    const full = computed(() => titles.value.length >= MAX_HIDDEN_COURSES)

    const isHidden = (title: string) => titles.value.includes(title)
    /**
     * False, and nothing saved, when it would go past the limit. Shrinking is
     * always allowed, so a list already over it from before can be emptied.
     */
    const set = (next: string[]): boolean => {
        const size = new Set(next).size
        if (size > MAX_HIDDEN_COURSES && size > titles.value.length) return false
        save(next)
        return true
    }
    const hide = (title: string) => set([...titles.value, title])
    const unhide = (title: string) => set(titles.value.filter((t) => t !== title))

    return { titles, key, full, isHidden, hide, unhide, set }
})
