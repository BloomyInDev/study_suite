import { Hono } from 'hono'
import { listGroups } from '../lib/groups.js'
import { groupLabels, renderPlanningCard } from '../lib/og-card.js'

/** Where a link with no group we know falls back to: the generic card. */
const GENERIC_IMAGE = '/og-image.png'

/** Rendered cards, by headline. A card only changes if a group is renamed. */
const cache = new Map<string, Uint8Array<ArrayBuffer>>()
const CACHE_SIZE = 100

/**
 * The images the `og:image` of a shared planning link points at (see
 * apps/web/src/lib/seo.ts). Public, like the planning itself.
 */
export default new Hono().get('/planning.png', async (c) => {
    try {
        const labels = groupLabels(c.req.query('group') ?? '', await listGroups(true))
        if (labels.length === 0) return c.redirect(GENERIC_IMAGE, 302)

        const key = labels.join('\n')
        let png = cache.get(key)
        if (!png) {
            png = await renderPlanningCard(labels)
            if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value!)
            cache.set(key, png)
        }
        return c.body(png, 200, {
            'Content-Type': 'image/png',
            // Discord and the like fetch it once per message; a day keeps
            // repeat unfurls off the renderer without pinning a renamed group.
            'Cache-Control': 'public, max-age=86400',
        })
    } catch (err) {
        console.error('[og]', err)
        // An embed with the generic card beats one with no image.
        return c.redirect(GENERIC_IMAGE, 302)
    }
})
