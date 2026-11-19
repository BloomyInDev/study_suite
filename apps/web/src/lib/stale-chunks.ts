import type { Router } from 'vue-router'
import { useNotificationsStore } from '../stores/notifications.js'

/**
 * A tab opened before a deploy still names the previous build's chunks
 * (`/assets/PlanningView-<hash>.js`), and nginx answers 404 for them: every
 * route is lazy, so the next navigation to a page not yet loaded fails, and
 * without this the page froze half way.
 *
 * During a navigation the user is leaving the page anyway, so a full load of
 * the target fetches the current index.html and its new hashes, and loses
 * nothing a normal navigation would have kept. Outside a navigation nothing
 * reloads by itself: the page may hold a form being filled in, so the user is
 * told and decides.
 */

// How each engine words a failed `import()`: Chromium, Firefox, Safari, and
// Vite's own CSS preload.
const CHUNK_ERROR =
    /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS/i

export function isChunkLoadError(err: unknown): boolean {
    return err instanceof Error && CHUNK_ERROR.test(err.message)
}

// A chunk that is really broken would reload forever: one try per target in
// this window, then the user gets an error instead.
const GUARD_KEY = 'study_suite_chunk_reload'
const GUARD_MS = 10_000

function reloadedRecently(target: string): boolean {
    try {
        const raw = sessionStorage.getItem(GUARD_KEY)
        if (!raw) return false
        const { path, at } = JSON.parse(raw) as { path: string; at: number }
        return path === target && Date.now() - at < GUARD_MS
    } catch {
        return false
    }
}

function markReload(target: string) {
    try {
        sessionStorage.setItem(GUARD_KEY, JSON.stringify({ path: target, at: Date.now() }))
    } catch {
        // Storage blocked: no loop guard, but still better than a frozen page.
    }
}

export function handleStaleChunks(router: Router) {
    // The navigation in flight, if any: a preload error during one also
    // rejects the route's import, which router.onError handles.
    let pending: string | null = null
    router.beforeEach((to) => {
        pending = to.fullPath
    })
    router.afterEach(() => {
        pending = null
    })

    router.onError((err, to) => {
        const target = to?.fullPath ?? pending
        pending = null
        if (!isChunkLoadError(err) || !target) return
        if (reloadedRecently(target)) {
            useNotificationsStore().error(
                "La page n'a pas pu se charger. Réessayez dans un instant.",
                8000,
            )
            return
        }
        markReload(target)
        window.location.assign(target)
    })

    window.addEventListener('vite:preloadError', () => {
        if (pending) return
        useNotificationsStore().warning(
            'Une nouvelle version du site est en ligne : rechargez la page quand vous aurez fini.',
            10000,
        )
    })
}
