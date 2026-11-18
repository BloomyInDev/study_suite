import type { Context } from 'hono'

/**
 * Request-time page rendering.
 *
 * nginx serves every file it has and sends every other GET here, falling back
 * to the static page vite-ssg built when this answers 5xx. So a failure costs a
 * visitor nothing more than the per-request head: they get the page they got
 * before this existed.
 *
 * The Vue app itself comes from apps/web as one self-contained bundle
 * (`entry-server.ts`), so the api depends on none of the web packages. The
 * template and the ssr manifest are fetched from the web container instead of
 * being baked in here: they name the hashed assets, and only nginx knows which
 * build it is serving. An api built from another commit then still points the
 * browser at files that exist.
 */

export interface RenderAssets {
    template: string
    manifest: Record<string, string[]>
    siteUrl: string
    /** Opaque here: the web side seeds its groups store with them. */
    groups?: unknown[]
}

type Render = (url: string, assets: RenderAssets) => Promise<string>

export interface SsrOptions {
    siteUrl: string
    webOrigin: string
    bundlePath: string
    /**
     * Every group, hidden ones included, so a `?group=` link resolves while
     * rendering and its head can name the group. Only called for urls that
     * carry one.
     */
    loadGroups?: () => Promise<unknown[]>
    /** Injected by the tests. */
    fetch?: typeof fetch
    importBundle?: (path: string) => Promise<{ render: Render }>
}

/** How long the web container may take to hand over the template. */
const WEB_TIMEOUT_MS = 2_000

export function createSsrHandler(options: SsrOptions) {
    const doFetch = options.fetch ?? fetch
    const importBundle =
        options.importBundle ?? ((path: string) => import(path) as Promise<{ render: Render }>)

    let renderer: Promise<Render> | null = null
    function loadRenderer() {
        // A failed import is not cached, so a bundle that appears later (or a
        // transient error) does not need an api restart.
        renderer ??= importBundle(options.bundlePath)
            .then((m) => m.render)
            .catch((err: unknown) => {
                renderer = null
                throw err
            })
        return renderer
    }

    // Revalidated on every request with the ETag nginx hands out, so a web
    // redeploy is picked up on the next page view, and an unchanged file costs
    // a 304 on the docker network.
    const cache = new Map<string, { etag: string; value: unknown }>()
    async function fromWeb<T>(path: string, parse: (body: string) => T): Promise<T> {
        const hit = cache.get(path)
        const res = await doFetch(options.webOrigin + path, {
            headers: hit ? { 'If-None-Match': hit.etag } : {},
            signal: AbortSignal.timeout(WEB_TIMEOUT_MS),
        })
        if (res.status === 304 && hit) return hit.value as T
        if (!res.ok) throw new Error(`web answered ${res.status} for ${path}`)
        const value = parse(await res.text())
        const etag = res.headers.get('etag')
        if (etag) cache.set(path, { etag, value })
        else cache.delete(path)
        return value
    }

    return async (c: Context) => {
        const url = new URL(c.req.url)
        // Unknown api paths stay JSON 404s, not pages.
        if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return c.notFound()

        try {
            const { loadGroups } = options
            const [render, template, manifest, groups] = await Promise.all([
                loadRenderer(),
                fromWeb('/ssr-template.html', (s) => s),
                fromWeb(
                    '/.vite/ssr-manifest.json',
                    (s) => JSON.parse(s) as Record<string, string[]>,
                ),
                url.searchParams.has('group') && loadGroups ? loadGroups() : undefined,
            ])
            const html = await render(url.pathname + url.search, {
                template,
                manifest,
                siteUrl: options.siteUrl,
                groups,
            })
            // Like the static pages: stored, but revalidated before reuse.
            return c.html(html, 200, { 'Cache-Control': 'no-cache' })
        } catch (err) {
            console.error('[ssr]', url.pathname, err)
            // nginx turns this into the static page.
            return c.text('render failed', 500)
        }
    }
}

/** What nginx falls back on when rendering is not configured. */
export function ssrDisabled(c: Context) {
    const path = new URL(c.req.url).pathname
    if (path === '/api' || path.startsWith('/api/')) return c.notFound()
    return c.text('ssr not configured', 503)
}
