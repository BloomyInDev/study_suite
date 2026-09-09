/**
 * Study Suite — course reminders.
 *
 * Deliberately registers no `fetch` handler: this worker caches nothing and
 * intercepts nothing. nginx rewrites the origin into a fresh copy of `dist` at
 * every container start (see the head-tags section of AGENTS.md), and a caching
 * service worker would happily serve the previous one for days.
 *
 * Not bundled — `public/` is copied verbatim — so this file is plain JS and
 * cannot import from `src/`.
 */

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
    // The api encrypts a JSON body (RFC 8291); the push service only ever saw a
    // blob it could not read. A push with no data is not ours, but showing
    // *something* is mandatory on several platforms — a worker that wakes and
    // stays silent gets its permission revoked.
    let payload = { title: 'Study Suite', body: 'Prochain cours', url: '/', eventId: 'unknown' }
    if (event.data) {
        try {
            payload = { ...payload, ...event.data.json() }
        } catch {
            payload.body = event.data.text()
        }
    }

    event.waitUntil(
        self.registration.showNotification(payload.title, {
            body: payload.body,
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            lang: 'fr',
            // One notification per course: a re-send replaces the banner rather
            // than stacking a second one.
            tag: `course-${payload.eventId}`,
            data: { url: payload.url || '/' },
        }),
    )
})

self.addEventListener('notificationclick', (event) => {
    event.notification.close()
    const target = (event.notification.data && event.notification.data.url) || '/'

    event.waitUntil(
        (async () => {
            const windows = await self.clients.matchAll({
                type: 'window',
                includeUncontrolled: true,
            })
            // Focus the app if it is already open somewhere; opening a second
            // tab on top of an existing one is the usual annoyance here.
            const open = windows.find((client) => client.url.startsWith(self.registration.scope))
            if (open) {
                await open.focus()
                if ('navigate' in open) await open.navigate(target).catch(() => {})
                return
            }
            await self.clients.openWindow(target)
        })(),
    )
})

/**
 * Chrome fires this when it rotates the subscription out from under us. The
 * page cannot fix it — it may not be open — but it can be told to re-subscribe
 * the next time it runs, which `lib/push.ts` does on every load.
 */
self.addEventListener('pushsubscriptionchange', (event) => {
    event.waitUntil(
        (async () => {
            const clientList = await self.clients.matchAll({ includeUncontrolled: true })
            for (const client of clientList) client.postMessage({ type: 'resubscribe' })
        })(),
    )
})
