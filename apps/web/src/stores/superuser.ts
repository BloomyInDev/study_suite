import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useAuthStore } from './auth.js'

const KEY = 'study_suite_superuser'

function readStored(): boolean {
    try {
        return sessionStorage.getItem(KEY) === '1'
    } catch {
        // No sessionStorage during the server render, or storage blocked.
        return false
    }
}

/**
 * An admin's superuser mode: the only way past the lock on a teacher's
 * homework (`lib/assignment-lock.ts` in the api). An admin is often a student
 * too, so being admin alone changes nothing; the mode has to be switched on.
 *
 * Kept in sessionStorage, so it ends with the tab rather than lingering for
 * days on an account its owner mostly uses as a student.
 */
export const useSuperuserStore = defineStore('superuser', () => {
    const auth = useAuthStore()
    const enabled = ref(readStored())

    const active = computed(() => auth.isAdmin && enabled.value)

    function toggle() {
        enabled.value = !enabled.value
        try {
            if (enabled.value) sessionStorage.setItem(KEY, '1')
            else sessionStorage.removeItem(KEY)
        } catch {
            // The mode still works for this page, it just won't survive a reload.
        }
    }

    /** Headers to add to a homework edit or delete. */
    function headers(): Record<string, string> {
        return active.value ? { 'X-Superuser': '1' } : {}
    }

    return { enabled, active, toggle, headers }
})
