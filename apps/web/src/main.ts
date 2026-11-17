import { ViteSSG } from 'vite-ssg'
import 'vuetify/styles'
import '@mdi/font/css/materialdesignicons.css'
import '@fortawesome/fontawesome-free/css/all.min.css'
import './styles.css'
import App from './App.vue'
import { registerGuards, routes } from './router.js'
import { installPlugins } from './setup.js'

// vite-ssg renders through jsdom (ssgOptions.mock), so Vuetify sees a window and
// takes its browser path, which reaches for observer APIs jsdom does not
// implement. Nothing observes anything in a one-shot static render, so no-ops
// are enough to let the page render.
if (import.meta.env.SSR) {
    class NoopObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
        takeRecords() {
            return []
        }
    }
    const globals = globalThis as Record<string, unknown>
    globals.ResizeObserver ??= NoopObserver
    globals.IntersectionObserver ??= NoopObserver
    globals.MutationObserver ??= NoopObserver
}

// vite-ssg renders every route to its own HTML file at build time, so the head
// unhead sets per page (see lib/seo.ts) is in the file a crawler downloads and
// does not depend on JavaScript running. It also owns the app, router and head
// instances, which is why they are created here rather than at module scope.
export const createApp = ViteSSG(App, { routes }, ({ app, router }) => {
    const savedTheme = import.meta.env.SSR
        ? 'light'
        : (localStorage.getItem('study_suite_theme') ?? 'light')

    installPlugins(app, savedTheme)

    // The guard answers for a visitor with no account, which at build time
    // would give every protected route the login page's head.
    if (!import.meta.env.SSR) registerGuards(router)
})
