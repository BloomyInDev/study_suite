import { createHash } from 'node:crypto'
import { Hono } from 'hono'
import { events } from '@studysuite/db'
import { and, asc } from 'drizzle-orm'
import { addParisDays, parisDayFromKey, parisDayKey } from '@studysuite/shared/time'
import { config } from '../config.js'
import { db } from '../db.js'
import { CARD_WIDTH, dayCardSvg, type CardEvent } from '../lib/day-card.js'
import { eventFilterConditions } from '../lib/event-filters.js'
import { expandGroupIds } from '../lib/group-ancestors.js'
import { listGroups } from '../lib/groups.js'
import { renderPng, resolveGroups } from '../lib/og-card.js'
import { withEventRelations } from '../lib/serialize.js'

/** Where a link with no group we know falls back to: the generic card. */
const GENERIC_IMAGE = '/og-image.png'

/** Rendered at twice the layout grid, for phone screens. */
const RENDER_WIDTH = CARD_WIDTH * 2

/**
 * Rendered cards, by what they show. The planning changes during the day, so
 * the key is the content itself, not the url: a moved course draws a new card
 * on the next fetch, and an unchanged day costs one query and no render.
 */
const cache = new Map<string, Uint8Array<ArrayBuffer>>()
const CACHE_SIZE = 100

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/

/** The Paris day `?date=` names, or today when it names none that exists. */
function dayFrom(raw: string | undefined): Date {
    if (raw && DAY_KEY.test(raw)) {
        const day = parisDayFromKey(raw)
        // 2026-02-31 parses into March; only a key that reads back is a day.
        if (parisDayKey(day) === raw) return day
    }
    return parisDayFromKey(parisDayKey(new Date()))
}

const host = config.ssr ? new URL(config.ssr.siteUrl).host : undefined

/**
 * The image the `og:image` of a shared planning link points at (see
 * apps/web/src/lib/seo.ts): that day of those groups' planning. Public, like
 * the planning itself.
 */
export default new Hono().get('/planning.png', async (c) => {
    try {
        const groups = resolveGroups(c.req.query('group') ?? '', await listGroups(true))
        if (groups.length === 0) return c.redirect(GENERIC_IMAGE, 302)

        const day = dayFrom(c.req.query('date'))
        // A course is tagged with the widest group it is for, so a group's day
        // includes its ancestors' courses, as on the planning.
        const groupIds = await expandGroupIds(
            groups.map((g) => g.id),
            true,
        )
        const rows = await db.query.events.findMany({
            where: and(...eventFilterConditions({ from: day, to: addParisDays(day, 1), groupIds })),
            with: withEventRelations,
            orderBy: asc(events.startDate),
        })
        const cardEvents: CardEvent[] = rows.map((r) => ({
            title: r.title,
            start: r.startDate,
            end: r.endDate,
            color: r.color,
            teachers: r.eventTeachers.map((t) => `${t.teacher.firstName} ${t.teacher.lastName}`),
            rooms: r.eventLocations.map((l) => l.location.name),
        }))
        const card = { labels: groups.map((g) => g.label), day, events: cardEvents, host }

        const key = createHash('sha1').update(JSON.stringify(card)).digest('hex')
        let png = cache.get(key)
        if (!png) {
            png = await renderPng(dayCardSvg(card), RENDER_WIDTH)
            if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value!)
            cache.set(key, png)
        }

        // A past day is settled; today can still move, so unfurlers and
        // browsers come back for it after a few minutes.
        const past = day.getTime() < parisDayFromKey(parisDayKey(new Date())).getTime()
        return c.body(png, 200, {
            'Content-Type': 'image/png',
            'Cache-Control': `public, max-age=${past ? 86400 : 300}`,
        })
    } catch (err) {
        console.error('[og]', err)
        // An embed with the generic card beats one with no image.
        return c.redirect(GENERIC_IMAGE, 302)
    }
})
