import { computed } from 'vue'
import { useHead, useSeoMeta } from '@unhead/vue'
import { useRoute } from 'vue-router'
import { DEFAULT_DESCRIPTION, OG_IMAGE_PATH, SITE_NAME, pageSeo, pageTitle } from './pages.js'

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
 * are described in `pages.ts`, and vite-ssg renders the result into each
 * page's static HTML at build time.
 */
export function usePageSeo() {
    const route = useRoute()
    const page = computed(() => pageSeo(route.path))

    const title = computed(() => pageTitle(page.value))
    const description = computed(() => page.value.description ?? DEFAULT_DESCRIPTION)
    // Query params are view state (the week being looked at, a selected group),
    // not distinct pages.
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
        ogImage: OG_IMAGE,
        ogImageType: 'image/png',
        ogImageWidth: 1200,
        ogImageHeight: 630,
        ogImageAlt: `${SITE_NAME} — ${DEFAULT_DESCRIPTION}`,
        twitterCard: 'summary_large_image',
        twitterTitle: title,
        twitterDescription: description,
        twitterImage: OG_IMAGE,
    })
}
