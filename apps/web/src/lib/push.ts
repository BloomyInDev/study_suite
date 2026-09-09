import { backend } from './api.js'

/**
 * The browser half of course reminders: the service worker registration, the
 * push subscription, and keeping the api's copy of it in step.
 *
 * Nothing here runs during the static render — vite-ssg renders under jsdom,
 * which has neither `Notification` nor a push manager — so every entry point
 * checks `pushSupported()` first.
 */

const SW_URL = '/sw.js'

export function pushSupported(): boolean {
    return (
        !import.meta.env.SSR &&
        typeof window !== 'undefined' &&
        'serviceWorker' in navigator &&
        'PushManager' in window &&
        'Notification' in window
    )
}

/**
 * Whether push would work here *if* the app were installed to the home screen.
 *
 * iOS grants push only to a standalone PWA: in a plain Safari tab `PushManager`
 * is not even defined, so `pushSupported()` is already false there. This only
 * separates "install it and it will work" from "this browser cannot", which is
 * what lets the settings card disappear rather than offer a toggle that would
 * do nothing.
 */
export function installRequired(): boolean {
    if (import.meta.env.SSR || typeof window === 'undefined') return false
    const isIos = /iP(hone|ad|od)/.test(navigator.userAgent)
    const standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as { standalone?: boolean }).standalone === true
    return isIos && !standalone
}

export function permission(): NotificationPermission {
    return pushSupported() ? Notification.permission : 'denied'
}

/**
 * `applicationServerKey` takes the raw 65 bytes. Browsers do accept the
 * base64url string form, but not uniformly enough to rely on for the one call
 * the whole feature hangs off.
 */
function decodeVapidKey(base64Url: string): ArrayBuffer {
    const padded = base64Url.padEnd(base64Url.length + ((4 - (base64Url.length % 4)) % 4), '=')
    const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
    const buffer = new ArrayBuffer(binary.length)
    const bytes = new Uint8Array(buffer)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return buffer
}

async function ensureRegistration(): Promise<ServiceWorkerRegistration> {
    // Registering the same URL twice is a no-op that hands back the existing
    // registration, so this is safe to call on every entry point.
    await navigator.serviceWorker.register(SW_URL, { scope: '/' })
    return navigator.serviceWorker.ready
}

export async function currentSubscription(): Promise<PushSubscription | null> {
    if (!pushSupported()) return null
    const existing = await navigator.serviceWorker.getRegistration(SW_URL)
    return (await existing?.pushManager.getSubscription()) ?? null
}

/** Push the local state of a subscription to the api. Idempotent on endpoint. */
async function save(
    subscription: PushSubscription,
    groupIds: string[],
    leadMinutes: number,
): Promise<void> {
    const { keys } = subscription.toJSON() as { keys?: { p256dh?: string; auth?: string } }
    if (!keys?.p256dh || !keys.auth) throw new Error('subscription carries no keys')

    const res = await backend.api.push.subscriptions.$put({
        json: {
            endpoint: subscription.endpoint,
            keys: { p256dh: keys.p256dh, auth: keys.auth },
            groupIds,
            leadMinutes,
        },
    })
    if (!res.ok) throw new Error(`api refused the subscription (${res.status})`)
}

/**
 * Ask for permission, subscribe, and register with the api.
 *
 * The permission prompt has to be driven by a real click — every browser drops
 * it otherwise — so this belongs on an event handler, not in `onMounted`.
 */
export async function enablePush(
    vapidPublicKey: string,
    groupIds: string[],
    leadMinutes: number,
): Promise<PushSubscription> {
    if (!pushSupported()) throw new Error('unsupported')

    const granted = await Notification.requestPermission()
    if (granted !== 'granted') throw new Error(granted === 'denied' ? 'denied' : 'dismissed')

    const registration = await ensureRegistration()
    const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
            // Every push must show a notification. Chrome enforces it, and it
            // is also the honest contract: no silent background wakeups.
            userVisibleOnly: true,
            applicationServerKey: decodeVapidKey(vapidPublicKey),
        }))

    await save(subscription, groupIds, leadMinutes)
    return subscription
}

export async function disablePush(): Promise<void> {
    const subscription = await currentSubscription()
    if (!subscription) return

    // The api first: if `unsubscribe()` fails we have at least stopped the
    // sending, whereas the reverse order leaves a row pushing into the void.
    await backend.api.push.subscriptions.$delete({ query: { endpoint: subscription.endpoint } })
    await subscription.unsubscribe()
}

/**
 * Re-send the current groups and lead time — after the student changes class,
 * picks different groups, or the browser rotates the subscription. A no-op when
 * this browser never subscribed.
 */
export async function syncPush(groupIds: string[], leadMinutes: number): Promise<boolean> {
    const subscription = await currentSubscription()
    if (!subscription) return false
    await save(subscription, groupIds, leadMinutes)
    return true
}

/** What the api has stored for this browser, or null. */
export async function fetchStored(): Promise<{ groupIds: string[]; leadMinutes: number } | null> {
    const subscription = await currentSubscription()
    if (!subscription) return null

    const res = await backend.api.push.subscriptions.$get({
        query: { endpoint: subscription.endpoint },
    })
    if (!res.ok) return null
    const body = await res.json()
    return body.data ?? null
}

/** Ask the api to push this browser a notification right now. */
export async function sendTestPush(): Promise<'sent' | 'gone' | 'failed' | 'not-subscribed'> {
    const subscription = await currentSubscription()
    if (!subscription) return 'not-subscribed'

    const res = await backend.api.push.test.$post({ query: { endpoint: subscription.endpoint } })
    if (!res.ok) return 'failed'
    const body = await res.json()
    return body.data.result
}
