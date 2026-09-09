import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
    currentSubscription,
    disablePush,
    enablePush,
    fetchStored,
    permission,
    pushSupported,
    sendTestPush,
    syncPush,
} from '../lib/push.js'
import { useGroupsStore } from './groups.js'
import { useProvidersStore } from './providers.js'

export const LEAD_CHOICES = [5, 10, 15, 30, 60] as const

const LS_LEAD = 'study_suite_reminder_lead'
const DEFAULT_LEAD = 15

/** Remembered locally only so the picker shows the right value before the api
 *  answers; the row in `push_subscriptions` is the truth. */
function storedLead(): number {
    const raw = Number(localStorage.getItem(LS_LEAD))
    return LEAD_CHOICES.includes(raw as (typeof LEAD_CHOICES)[number]) ? raw : DEFAULT_LEAD
}

/**
 * Course reminders: one toggle, one lead time, per browser.
 *
 * Per *browser*, not per account — a push subscription belongs to the install,
 * so signing in on a phone and a laptop is two subscriptions, and turning
 * reminders off on one leaves the other alone. That is also why this works
 * without an account at all.
 */
export const useRemindersStore = defineStore('reminders', () => {
    const supported = ref(false)
    const subscribed = ref(false)
    const leadMinutes = ref(DEFAULT_LEAD)
    const busy = ref(false)
    const error = ref<string | null>(null)
    const perm = ref<NotificationPermission>('default')

    const providers = useProvidersStore()

    /** The deployment has keys, and this browser can act on them. */
    const available = computed(() => supported.value && providers.push.enabled)

    /** Nothing the app can do about this one — it has to be undone in the
     *  browser's own site settings. */
    const blocked = computed(() => perm.value === 'denied')

    function groupIds(): string[] {
        return useGroupsStore().effectiveGroupIds
    }

    async function init(): Promise<void> {
        supported.value = pushSupported()
        if (!supported.value) return

        perm.value = permission()
        leadMinutes.value = storedLead()
        subscribed.value = (await currentSubscription()) !== null
        if (!subscribed.value) return

        // The server's copy wins: this browser may have been re-installed, or
        // the lead changed from another tab.
        const stored = await fetchStored()
        if (stored) {
            leadMinutes.value = stored.leadMinutes
            localStorage.setItem(LS_LEAD, String(stored.leadMinutes))
        } else {
            // Subscribed here but unknown to the api — the row was pruned after
            // a run of failures, or the database was restored. Re-register.
            await syncPush(groupIds(), leadMinutes.value)
        }
    }

    async function enable(): Promise<boolean> {
        if (!providers.push.publicKey) return false
        busy.value = true
        error.value = null
        try {
            await enablePush(providers.push.publicKey, groupIds(), leadMinutes.value)
            subscribed.value = true
            return true
        } catch (err) {
            const reason = (err as Error).message
            error.value =
                reason === 'denied'
                    ? 'Les notifications sont bloquées pour ce site. Autorise-les dans les réglages du navigateur.'
                    : reason === 'dismissed'
                      ? 'Demande annulée.'
                      : "Impossible d'activer les rappels."
            return false
        } finally {
            perm.value = permission()
            busy.value = false
        }
    }

    async function disable(): Promise<void> {
        busy.value = true
        try {
            await disablePush()
            subscribed.value = false
        } finally {
            busy.value = false
        }
    }

    async function setLead(minutes: number): Promise<void> {
        leadMinutes.value = minutes
        localStorage.setItem(LS_LEAD, String(minutes))
        if (subscribed.value) await syncPush(groupIds(), minutes)
    }

    /** Called when the student's class or local group selection changes. */
    async function syncGroups(): Promise<void> {
        if (!supported.value || !subscribed.value) return
        await syncPush(groupIds(), leadMinutes.value)
    }

    async function test(): Promise<'sent' | 'gone' | 'failed' | 'not-subscribed'> {
        busy.value = true
        try {
            const result = await sendTestPush()
            // A `gone` endpoint was just deleted server-side; reflect that.
            if (result === 'gone' || result === 'not-subscribed') subscribed.value = false
            return result
        } finally {
            busy.value = false
        }
    }

    return {
        supported,
        subscribed,
        leadMinutes,
        busy,
        error,
        perm,
        available,
        blocked,
        init,
        enable,
        disable,
        setLead,
        syncGroups,
        test,
    }
})
