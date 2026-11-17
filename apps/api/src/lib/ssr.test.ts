import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { createSsrHandler, ssrDisabled, type RenderAssets } from './ssr.js'

const TEMPLATE = '<html><head></head><body><div id="app"></div></body></html>'
const MANIFEST = { 'src/App.vue': ['/assets/App.js'] }

/** A web container that serves both files with an ETag and honours If-None-Match. */
function fakeWeb() {
    const calls: { path: string; ifNoneMatch: string | null }[] = []
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(input)).pathname
        const ifNoneMatch = new Headers(init?.headers).get('If-None-Match')
        calls.push({ path, ifNoneMatch })
        const etag = `"${path}-v1"`
        if (ifNoneMatch === etag) return new Response(null, { status: 304 })
        const body = path === '/ssr-template.html' ? TEMPLATE : JSON.stringify(MANIFEST)
        return new Response(body, { headers: { etag } })
    })
    return { fetch: fetch as unknown as typeof globalThis.fetch, calls }
}

function app(render: (url: string, assets: RenderAssets) => Promise<string>, web = fakeWeb()) {
    const importBundle = vi.fn(async () => ({ render }))
    const handler = createSsrHandler({
        siteUrl: 'https://site.test',
        webOrigin: 'http://web',
        bundlePath: '/bundle.js',
        fetch: web.fetch,
        importBundle,
    })
    return { app: new Hono().get('*', handler), web, importBundle }
}

describe('createSsrHandler', () => {
    it('renders the path and query with the fetched template, manifest and origin', async () => {
        const render = vi.fn(
            async (url: string, a: RenderAssets) => `${url}|${a.siteUrl}|${a.template}`,
        )
        const { app: a } = app(render)
        const res = await a.request('/planning?group=S1')
        expect(res.status).toBe(200)
        expect(res.headers.get('content-type')).toContain('text/html')
        expect(res.headers.get('cache-control')).toBe('no-cache')
        expect(await res.text()).toBe(`/planning?group=S1|https://site.test|${TEMPLATE}`)
        expect(render.mock.calls[0][1].manifest).toEqual(MANIFEST)
    })

    it('revalidates the template and reuses it on a 304', async () => {
        const { app: a, web } = app(async (_u, assets) => assets.template)
        await a.request('/')
        const res = await a.request('/')
        expect(await res.text()).toBe(TEMPLATE)
        const second = web.calls.filter((c) => c.path === '/ssr-template.html')[1]
        expect(second.ifNoneMatch).toBe('"/ssr-template.html-v1"')
    })

    it('answers 500 when the render throws, for nginx to fall back on', async () => {
        const { app: a } = app(async () => {
            throw new Error('boom')
        })
        vi.spyOn(console, 'error').mockImplementation(() => {})
        expect((await a.request('/planning')).status).toBe(500)
    })

    it('answers 500 when the web container is unreachable', async () => {
        const web = {
            fetch: (async () => new Response('', { status: 502 })) as unknown as typeof fetch,
            calls: [],
        }
        const { app: a } = app(async () => 'never', web)
        vi.spyOn(console, 'error').mockImplementation(() => {})
        expect((await a.request('/')).status).toBe(500)
    })

    it('leaves unknown api paths as 404s', async () => {
        const render = vi.fn(async () => 'page')
        const { app: a } = app(render)
        expect((await a.request('/api/nope')).status).toBe(404)
        expect((await a.request('/api')).status).toBe(404)
        expect(render).not.toHaveBeenCalled()
    })

    it('retries a bundle import that failed', async () => {
        const importBundle = vi
            .fn()
            .mockRejectedValueOnce(new Error('missing'))
            .mockResolvedValue({ render: async () => 'page' })
        const handler = createSsrHandler({
            siteUrl: 'https://site.test',
            webOrigin: 'http://web',
            bundlePath: '/bundle.js',
            fetch: fakeWeb().fetch,
            importBundle,
        })
        const a = new Hono().get('*', handler)
        vi.spyOn(console, 'error').mockImplementation(() => {})
        expect((await a.request('/')).status).toBe(500)
        expect((await a.request('/')).status).toBe(200)
    })
})

describe('ssrDisabled', () => {
    it('answers 503 for pages and 404 for api paths', async () => {
        const a = new Hono().get('*', ssrDisabled)
        expect((await a.request('/planning')).status).toBe(503)
        expect((await a.request('/api/nope')).status).toBe(404)
    })
})
