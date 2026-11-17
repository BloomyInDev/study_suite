import type { App } from 'vue'
import { createPinia } from 'pinia'
import { createVuetify } from 'vuetify'
import { aliases, mdi } from 'vuetify/iconsets/mdi'
import { fa } from 'vuetify/iconsets/fa'

/**
 * The plugins every render of the app needs, whoever owns the app: vite-ssg in
 * the browser and at build time (main.ts), the api at request time
 * (entry-server.ts). Each call creates fresh instances, so two requests never
 * share a store.
 *
 * Vuetify reads the head instance at install time to emit its theme
 * stylesheet, so the caller installs unhead first.
 */
export function installPlugins(app: App, theme: string) {
    const pinia = createPinia()
    app.use(pinia)
    app.use(
        createVuetify({
            // The markup is rendered on a server first (build time and request
            // time), where Vuetify must not reach for browser APIs.
            ssr: true,
            theme: { defaultTheme: theme },
            icons: {
                defaultSet: 'mdi',
                aliases,
                sets: { mdi, fa },
            },
        }),
    )
    return { pinia }
}
