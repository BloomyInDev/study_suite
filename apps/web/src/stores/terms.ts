import { TERMS_VERSION } from '@studysuite/shared/legal'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { API_URL } from '../lib/api-url'
import { useAuthStore } from './auth.js'

const LS_KEY = 'study_suite_terms_version'

function storedVersion(): string | null {
    try {
        return localStorage.getItem(LS_KEY)
    } catch {
        return null
    }
}

/**
 * Whether the current CGU have been accepted, here or on the account.
 *
 * A visitor's acceptance lives in this browser. Once signed in, it is copied to
 * the account, which is what keeps a record of it; an account that accepted
 * elsewhere counts here too.
 */
export const useTermsStore = defineStore('terms', () => {
    const auth = useAuthStore()
    const localVersion = ref(storedVersion())

    const accepted = computed(
        () =>
            localVersion.value === TERMS_VERSION ||
            auth.user?.termsAcceptedVersion === TERMS_VERSION,
    )

    async function accept(): Promise<void> {
        localVersion.value = TERMS_VERSION
        try {
            localStorage.setItem(LS_KEY, TERMS_VERSION)
        } catch {
            // Private mode: the bar comes back next visit, nothing worse.
        }
        await syncAccount()
    }

    /** Record on the account what this browser accepted, if it does not have it yet. */
    async function syncAccount(): Promise<void> {
        if (!auth.isAuthenticated || localVersion.value !== TERMS_VERSION) return
        if (auth.user?.termsAcceptedVersion === TERMS_VERSION) return
        const res = await fetch(`${API_URL}/api/auth/me/terms`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${auth.token}`,
            },
            body: JSON.stringify({ version: TERMS_VERSION }),
        })
        if (res.ok) await auth.refresh()
    }

    return { accepted, accept, syncAccount }
})
