import { computed } from 'vue'
import { useHead, useSeoMeta } from '@unhead/vue'
import { useRoute } from 'vue-router'
import { DEFAULT_DESCRIPTION, OG_IMAGE_PATH, SITE_NAME, pageSeo, pageTitle } from './pages.js'
import { useGroupOverride } from './group-override.js'
import { parisDayKey } from '@studysuite/shared/time'

/**
 * Absolute origin the og: tags point at, baked in at build time from
 * VITE_SITE_URL (see vite.config.ts). Crawlers do not resolve relative URLs.
 */
export const SITE_URL = import.meta.env.VITE_SITE_URL

const OG_IMAGE = `${SITE_URL}${OG_IMAGE_PATH}`

/**
 * Keeps the title and og: tags in step with the current route.
 *
 * Called once, from App.vue: the views carry no head code of their own, they
 * are described in `pages.ts`. vite-ssg renders the result into each page's
 * static HTML at build time, and the api renders it per request.
 */
export function usePageSeo() {
    const route = useRoute()
    const override = useGroupOverride()
    const page = computed(() => pageSeo(route.path))

    // A shared `/planning?group=S1` link names its group, in the embed and in
    // the tab. Only groups that resolve count, under their canonical names, so
    // nothing typed into the url reaches the head as is. On the server the
    // groups come from the api (see entry-server.ts); in the browser the head
    // catches up once they load.
    const groups = computed(() =>
        route.path === '/planning' && override.isActive.value ? override.matched.value : [],
    )
    const groupNames = computed(() => override.labels.value.join(', '))

    const title = computed(() =>
        groups.value.length > 0
            ? `${page.value.title} ${groupNames.value} · ${SITE_NAME}`
            : pageTitle(page.value),
    )
    const description = computed(() =>
        groups.value.length > 0
            ? `L'emploi du temps de ${groupNames.value}, semaine par semaine.`
            : (page.value.description ?? DEFAULT_DESCRIPTION),
    )
    // The card draws that day of the planning (apps/api/src/lib/day-card.ts).
    // The day is in the url so a link shared tomorrow unfurls tomorrow's
    // card: Discord and the like cache an image by its url.
    const image = computed(() => {
        if (groups.value.length === 0) return OG_IMAGE
        const names = encodeURIComponent(groups.value.map(override.urlName).join(','))
        return `${SITE_URL}/api/og/planning.png?group=${names}&date=${parisDayKey(new Date())}`
    })
    // Portrait for the day card, the generic image's landscape otherwise.
    const imageSize = computed(() =>
        groups.value.length > 0 ? { width: 900, height: 1600 } : { width: 1200, height: 630 },
    )
    const imageAlt = computed(() =>
        groups.value.length > 0
            ? `Le planning du jour de ${groupNames.value}`
            : `${SITE_NAME} — ${DEFAULT_DESCRIPTION}`,
    )
    // Query params are view state (the week being looked at, a selected group),
    // not distinct pages: the canonical url leaves them out.
    const url = computed(() => `${SITE_URL}${page.value.path}`)

    useHead({ link: [{ rel: 'canonical', href: url }] })

    useSeoMeta({
        title,
        description,
        robots: computed(() => (page.value.noindex ? 'noindex, nofollow' : null)),
        ogType: 'website',
        ogSiteName: SITE_NAME,
        ogTitle: title,
        ogDescription: description,
        ogUrl: url,
        ogLocale: 'fr_FR',
        ogImage: image,
        ogImageType: 'image/png',
        ogImageWidth: computed(() => imageSize.value.width),
        ogImageHeight: computed(() => imageSize.value.height),
        ogImageAlt: imageAlt,
        twitterCard: 'summary_large_image',
        twitterTitle: title,
        twitterDescription: description,
        twitterImage: image,
    })
}
