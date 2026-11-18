import { createSSRApp } from 'vue'
import { renderToString, type SSRContext } from 'vue/server-renderer'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createHead, transformHtmlTemplate } from '@unhead/vue/server'
import App from './App.vue'
import { routes } from './router.js'
import { installPlugins } from './setup.js'
import { useGroupsStore } from './stores/groups.js'
import type { Group } from './lib/types.js'

/**
 * Request-time rendering, run by the api (apps/api/src/lib/ssr.ts) from a
 * self-contained bundle built with `pnpm -F @studysuite/web build:ssr`.
 *
 * It produces the page vite-ssg writes at build time, with the same template,
 * preload links and head, but per request, so the head can depend on the query
 * string. The browser does not hydrate it: like the static pages, the client
 * renders over it from scratch (vite-ssg's `createApp`), so a difference
 * between the two renders cannot break anything.
 */

// The stores read localStorage while they set up. A server has none, and must
// not pretend to have a visitor's: their token, groups and theme stay in their
// browser. An empty stand-in that drops writes renders what a first-time
// visitor sees, which is what jsdom gave the build-time render too. It is a
// process global, set once, and holds nothing.
const noStorage: Storage = {
    length: 0,
    clear: () => {},
    getItem: () => null,
    key: () => null,
    removeItem: () => {},
    setItem: () => {},
}
const globals = globalThis as { localStorage?: Storage }
globals.localStorage ??= noStorage

export interface RenderAssets {
    /** The client's index.html as built, with an empty `#app`. */
    template: string
    /** vite's ssr-manifest.json: a module id to the chunks it needs. */
    manifest: Record<string, string[]>
    /** The public origin, replacing the `__SITE_URL__` the build was given. */
    siteUrl: string
    /**
     * Every group, hidden ones included, as `GET /api/groups?includeHidden=true`
     * returns them. Seeded into the store so a `?group=` link resolves as it
     * does in the browser, and its head can name the group. Optional: without
     * it the page renders as for no group.
     */
    groups?: Group[]
}

const CONTAINER = '<div id="app"></div>'

export async function render(url: string, assets: RenderAssets): Promise<string> {
    if (!assets.template.includes(CONTAINER)) throw new Error('template has no empty #app')

    const app = createSSRApp(App)
    const head = createHead()
    app.use(head)
    // The theme is a choice stored in the browser; the client applies it.
    const { pinia } = installPlugins(app, 'light')
    if (assets.groups) useGroupsStore(pinia).allGroups = assets.groups
    const router = createRouter({ history: createMemoryHistory(), routes })
    app.use(router)
    // No route guard: it answers for a visitor with no account, which would
    // give every protected route the login page. The client runs it.
    await router.push(url)
    await router.isReady()

    const ctx: SSRContext = {}
    const appHtml = await renderToString(app, ctx)

    const html = assets.template
        .replace('</head>', () => `${preloadLinks(ctx.modules, assets.manifest)}</head>`)
        .replace(CONTAINER, () => `<div id="app" data-server-rendered="true">${appHtml}</div>`)

    const withHead = await transformHtmlTemplate(head, html)
    return withHead.replaceAll('__SITE_URL__', assets.siteUrl)
}

/**
 * The chunks the rendered route needs, so the browser fetches them alongside
 * the entry instead of after it. Mirrors vite-ssg's `renderPreloadLinks`:
 * scripts as modulepreload, stylesheets as links, anything else skipped.
 */
function preloadLinks(modules: Set<string> | undefined, manifest: RenderAssets['manifest']) {
    const files = new Set<string>()
    for (const id of modules ?? []) for (const file of manifest[id] ?? []) files.add(file)
    let links = ''
    for (const file of files) {
        if (file.endsWith('.js')) links += `<link rel="modulepreload" crossorigin href="${file}">`
        else if (file.endsWith('.css')) links += `<link rel="stylesheet" href="${file}">`
    }
    return links
}
