import { ref } from 'vue'
import { API_URL } from './api-url'
import { authHeaders } from './auth-headers.js'
import { backend } from './api.js'
import type { AuthUser } from '../stores/auth.js'

/**
 * Which teacher of the planning a teacher account is, shared by the dialog
 * that asks after sign-in and the profile card that changes it later.
 *
 * "Not in the list" lives in this browser only, keyed on the account, until
 * the api keeps the answer itself (see AGENTS.md, Teacher accounts).
 */
const NOT_LISTED_KEY = 'study_suite_teacher_not_listed'

/**
 * The account that answered "not in the list" in this browser, if any. One
 * reactive copy for the dialog and the card: answering from the card has to
 * keep the dialog shut at once, not on the next page load.
 */
export const notListedFor = ref<string | null>(null)

/** Reads the answer from storage. Client only: the server render has none. */
export function loadNotListed() {
    try {
        notListedFor.value = localStorage.getItem(NOT_LISTED_KEY)
    } catch {
        notListedFor.value = null
    }
}

export function setNotListed(userId: string, notListed: boolean) {
    if (notListed) notListedFor.value = userId
    else if (notListedFor.value === userId) notListedFor.value = null
    try {
        if (notListedFor.value) localStorage.setItem(NOT_LISTED_KEY, notListedFor.value)
        else localStorage.removeItem(NOT_LISTED_KEY)
    } catch {
        // Storage blocked: the answer holds for this page only.
    }
}

export interface TeacherChoice {
    title: string
    value: string
}

/** Every teacher of the planning, as `NOM Prénom`, sorted like the api sorts them. */
export async function fetchTeacherChoices(): Promise<TeacherChoice[]> {
    const res = await backend.api.teachers.$get()
    const body = await res.json()
    return body.data.map((t) => ({ title: `${t.lastName} ${t.firstName}`, value: t.id }))
}

/** Links the account to a teacher, or unlinks it with null. Returns the updated profile. */
export async function saveMyTeacher(teacherId: string | null): Promise<AuthUser> {
    const res = await fetch(`${API_URL}/api/auth/me/teacher`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ teacherId }),
    })
    if (!res.ok) throw new Error(`PATCH /api/auth/me/teacher answered ${res.status}`)
    const body = (await res.json()) as { data: AuthUser }
    return body.data
}
