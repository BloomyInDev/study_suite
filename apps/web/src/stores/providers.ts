import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { API_URL } from '../lib/api-url'
import type { AuthProvider } from './auth.js'

export interface Provider {
    id: AuthProvider
    label: string
}

/**
 * What the login page renders before `GET /api/config` answers — and what the
 * static build bakes into `login/index.html`, which cannot fetch anything.
 * A deployment with no bridge configured drops the second one on hydration.
 */
const DEFAULTS: Provider[] = [
    { id: 'discord', label: 'Discord' },
    { id: 'iut', label: 'IUT' },
]

/**
 * Whether this deployment can send course reminders, and the VAPID key the
 * browser needs to subscribe. It rides along here because it comes from the
 * same `GET /api/config` this store already fetches at boot — one request, and
 * the settings screen never has to wait for a second one.
 *
 * Off until the api says otherwise: a toggle that appears and then turns out to
 * be unbacked is worse than one that appears a moment late.
 */
export interface PushConfig {
    enabled: boolean
    publicKey: string | null
}

export const useProvidersStore = defineStore('providers', () => {
    const providers = ref<Provider[]>([...DEFAULTS])
    const push = ref<PushConfig>({ enabled: false, publicKey: null })

    const has = (id: AuthProvider) => providers.value.some((p) => p.id === id)

    /** The configured name, falling back to the default rather than an id. */
    const label = (id: AuthProvider) =>
        providers.value.find((p) => p.id === id)?.label ??
        DEFAULTS.find((p) => p.id === id)?.label ??
        id

    const iutLabel = computed(() => label('iut'))

    async function fetchProviders(): Promise<void> {
        try {
            const res = await fetch(`${API_URL}/api/config`)
            if (!res.ok) return
            const { data } = (await res.json()) as {
                data: { providers: Provider[]; push?: PushConfig }
            }
            if (data?.providers?.length) providers.value = data.providers
            if (data?.push) push.value = data.push
        } catch {
            // Keep the defaults: a login page with no buttons is worse than a
            // stale label, and the api being down is already visible elsewhere.
        }
    }

    return { providers, push, has, label, iutLabel, fetchProviders }
})
