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

    const isHidden = (title: string) => titles.value.includes(title)
    const hide = (title: string) => save([...titles.value, title])
    const unhide = (title: string) => save(titles.value.filter((t) => t !== title))
    const set = (next: string[]) => save(next)

    return { titles, key, isHidden, hide, unhide, set }
})
