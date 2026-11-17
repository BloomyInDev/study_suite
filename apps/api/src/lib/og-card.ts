import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { initWasm, Resvg } from '@resvg/resvg-wasm'

/**
 * The 1200×630 card a shared planning link unfurls with: the design of
 * apps/web/public/og-image.svg, naming the groups instead of the tagline.
 *
 * resvg renders it, from its wasm build rather than the native one: the api's
 * node_modules are installed on Alpine and run on Debian, and a native addon
 * built for one libc does not load on the other. resvg has no system fonts, so
 * DejaVu Sans (what the static image was drawn with) ships in assets/fonts.
 */

/** Width left of the 1200 px card once the mark and the margins are taken. */
const TEXT_WIDTH = 1200 - 352 - 64
/** DejaVu Sans Bold's average advance, as a fraction of the font size. */
const BOLD_ADVANCE = 0.68
const MAX_SIZE = 96
const MIN_SIZE = 44
/** Past this many groups the card names the first ones and counts the rest. */
const MAX_LISTED = 3

const escapeXml = (s: string) => s.replace(/[<>&"']/g, (ch) => `&#${ch.charCodeAt(0)};`)

/** The headline for some group labels, short enough to read at a glance. */
export function headline(labels: string[]): string {
    const listed = labels.slice(0, MAX_LISTED).join(', ')
    const rest = labels.length - MAX_LISTED
    return rest > 0 ? `${listed} +${rest}` : listed
}

/**
 * The largest size, up to MAX_SIZE, at which the text fits on one line, and the
 * text itself, cut with an ellipsis if even MIN_SIZE is too wide.
 */
export function fitText(text: string): { text: string; size: number } {
    const widthAt = (size: number, s: string) => s.length * size * BOLD_ADVANCE
    const size = Math.floor(TEXT_WIDTH / (text.length * BOLD_ADVANCE))
    if (size >= MIN_SIZE) return { text, size: Math.min(size, MAX_SIZE) }
    let cut = text
    while (cut.length > 1 && widthAt(MIN_SIZE, `${cut}…`) > TEXT_WIDTH) cut = cut.slice(0, -1)
    return { text: `${cut.trimEnd()}…`, size: MIN_SIZE }
}

export function planningCardSvg(labels: string[]): string {
    const { text, size } = fitText(headline(labels))
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#0f2a4d" />
            <stop offset="1" stop-color="#1867c0" />
        </linearGradient>
        <linearGradient id="tile" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#2979d4" />
            <stop offset="1" stop-color="#1867c0" />
        </linearGradient>
    </defs>
    <rect width="1200" height="630" fill="url(#bg)" />
    <g transform="translate(96 210) scale(2.5)">
        <rect width="64" height="64" rx="14" fill="url(#tile)" />
        <rect x="12" y="12" width="16" height="26" rx="4" fill="#ffffff" />
        <rect x="36" y="12" width="16" height="14" rx="4" fill="#ffffff" opacity=".6" />
        <rect x="12" y="44" width="16" height="8" rx="4" fill="#ffffff" opacity=".6" />
        <rect x="36" y="32" width="16" height="20" rx="4" fill="#ffb300" />
    </g>
    <g font-family="DejaVu Sans">
        <text x="352" y="250" fill="#c7dcf6" font-size="40">Planning</text>
        <text x="352" y="${250 + 18 + size}" fill="#ffffff" font-size="${size}" font-weight="bold">${escapeXml(text)}</text>
        <text x="352" y="${250 + 18 + size + 60}" fill="#c7dcf6" font-size="32">Study Suite · Emploi du temps de l'IUT</text>
    </g>
    <rect x="352" y="${250 + 18 + size + 100}" width="120" height="8" rx="4" fill="#ffb300" />
</svg>`
}

const require = createRequire(import.meta.url)
const FONTS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../assets/fonts')

let ready: Promise<Uint8Array[]> | null = null
/** The wasm module and the fonts, loaded once, on the first card. */
function load(): Promise<Uint8Array[]> {
    ready ??= (async () => {
        const wasm = await readFile(require.resolve('@resvg/resvg-wasm/index_bg.wasm'))
        await initWasm(wasm)
        return Promise.all(
            ['DejaVuSans.ttf', 'DejaVuSans-Bold.ttf'].map(
                async (f) => new Uint8Array(await readFile(resolve(FONTS_DIR, f))),
            ),
        )
    })().catch((err: unknown) => {
        ready = null
        throw err
    })
    return ready
}

export async function renderPlanningCard(labels: string[]): Promise<Uint8Array<ArrayBuffer>> {
    const fontBuffers = await load()
    const resvg = new Resvg(planningCardSvg(labels), {
        font: { fontBuffers, defaultFontFamily: 'DejaVu Sans', loadSystemFonts: false },
        fitTo: { mode: 'width', value: 1200 },
    })
    // Copied into a buffer of its own, which is what a response body takes.
    return new Uint8Array(resvg.render().asPng())
}

interface NamedGroup {
    internalName: string
    displayName: string | null
}

const normalize = (s: string) => s.trim().toLowerCase()

/**
 * The labels of the groups a `?group=` value names, matched the way the web
 * app's `useGroupOverride` matches them: comma-separated, by scraped or display
 * name, case-insensitively. Unknown names are dropped, so nothing typed into a
 * url is ever drawn on the card.
 */
export function groupLabels(raw: string, groups: NamedGroup[]): string[] {
    const labels: string[] = []
    for (const name of raw.split(',').map(normalize).filter(Boolean)) {
        const group = groups.find(
            (g) =>
                normalize(g.internalName) === name ||
                (g.displayName ? normalize(g.displayName) === name : false),
        )
        const label = group ? group.displayName?.trim() || group.internalName : null
        if (label && !labels.includes(label)) labels.push(label)
    }
    return labels
}
