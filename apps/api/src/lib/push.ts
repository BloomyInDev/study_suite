import webpush from 'web-push'
import { config } from '../config.js'

/**
 * Web Push delivery, on top of the `web-push` package.
 *
 * The package owns the two parts worth not hand-rolling: the RFC 8292 VAPID
 * header (an ES256 JWT signed per push service origin) and the RFC 8291 payload
 * encryption (aes128gcm, keyed by the subscription's own P-256 key). The
 * payload is therefore opaque to Google, Apple and Mozilla — they route a blob
 * they cannot read.
 */

// `!= null` covers both the missing block and the commented-out one.
export const pushConfigured = config.push != null

if (config.push) {
    webpush.setVapidDetails(config.push.subject, config.push.publicKey, config.push.privateKey)
}

export const vapidPublicKey = config.push?.publicKey ?? null

/** What the service worker's `push` handler expects to find in `event.data`. */
export interface ReminderPayload {
    title: string
    body: string
    eventId: string
    url: string
}

export type SendResult = 'sent' | 'gone' | 'failed'

export interface PushTarget {
    endpoint: string
    p256dh: string
    auth: string
}

/**
 * `gone` means the browser dropped the subscription for good — the caller
 * should delete the row rather than count a failure. Everything else is
 * transient (the push service being unhappy, the network), and the next tick
 * will try the following course.
 */
export async function sendReminder(
    target: PushTarget,
    payload: ReminderPayload,
    ttlSeconds: number,
): Promise<SendResult> {
    if (!pushConfigured) return 'failed'

    try {
        await webpush.sendNotification(
            {
                endpoint: target.endpoint,
                keys: { p256dh: target.p256dh, auth: target.auth },
            },
            JSON.stringify(payload),
            {
                // A reminder is worthless once the course has started: let the
                // push service drop it rather than deliver it to a phone that
                // was off, an hour late.
                TTL: ttlSeconds,
                urgency: 'high',
            },
        )
        return 'sent'
    } catch (err) {
        const status = (err as { statusCode?: number }).statusCode
        // 404: the endpoint never existed. 410 Gone: the browser unsubscribed,
        // was uninstalled, or cleared its site data.
        if (status === 404 || status === 410) return 'gone'
        console.error('[push] send failed', status ?? '', (err as Error).message)
        return 'failed'
    }
}
