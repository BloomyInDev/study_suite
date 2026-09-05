import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vuetify from 'vite-plugin-vuetify'
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { PAGES } from './src/lib/pages.js'

// The docker build has no .git, so CI passes the commit as a build arg; fall
// back to asking git directly when building from a checkout.
const commitHash =
    process.env.VITE_GIT_COMMIT_HASH ||
    (() => {
        try {
            return execSync('git rev-parse --short HEAD').toString().trim()
        } catch {
            return 'unknown'
        }
    })()

// Absolute base for the og: tags — crawlers (Discord included) will not resolve
// a relative image. The docker build passes the public origin; a local build
// falls back to the dev server so the tags stay well-formed.
const siteUrl = (process.env.VITE_SITE_URL || 'http://localhost:5173').replace(/\/+$/, '')

// robots.txt and sitemap.xml are generated rather than kept in public/: both
// need the absolute origin, which is only known at build time, and both would
// drift from pages.ts if they were maintained by hand. `noindex` is the single
// switch — an entry marked with it is excluded here and carries the robots meta
// tag, so the two can never disagree.
function writeCrawlerFiles(outDir: string) {
    const indexable = PAGES.filter((p) => !p.noindex)
    const hidden = PAGES.filter((p) => p.noindex).map((p) => p.path)

    const urls = indexable.map((p) => `    <url><loc>${siteUrl}${p.path}</loc></url>`).join('\n')

    writeFileSync(
        `${outDir}/sitemap.xml`,
        `<?xml version="1.0" encoding="UTF-8"?>\n` +
            `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    )

    writeFileSync(
        `${outDir}/robots.txt`,
        [
            'User-agent: *',
            'Allow: /',
            // The api answers on this origin too, and none of it is a page.
            'Disallow: /api/',
            // A redirect, so it has no pages.ts entry of its own; the prefix
            // also covers every admin screen below it.
            'Disallow: /admin',
            ...hidden.map((path) => `Disallow: ${path}`),
            '',
            `Sitemap: ${siteUrl}/sitemap.xml`,
            '',
        ].join('\n'),
    )
}

export default defineConfig({
    plugins: [vue(), vuetify({ autoImport: true })],
    // Vuetify ships its component CSS as .css imports, which Node cannot load
    // when it is left external to the SSG render — bundle it instead.
    ssr: { noExternal: ['vuetify'] },
    ssgOptions: {
        // /planning → dist/planning/index.html, so nginx serves it for the URL
        // the SPA already uses; jsdom stands in for the browser globals the
        // stores read (localStorage, mostly) while rendering.
        dirStyle: 'nested',
        mock: true,
        onFinished: () => writeCrawlerFiles('dist'),
    },
    define: {
        'import.meta.env.VITE_GIT_COMMIT_HASH': JSON.stringify(commitHash),
        'import.meta.env.VITE_SITE_URL': JSON.stringify(siteUrl),
    },
})
