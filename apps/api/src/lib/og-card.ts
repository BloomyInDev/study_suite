import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { initWasm, Resvg } from '@resvg/resvg-wasm'

/**
 * Rendering the embed images: SVG in, PNG out.
 *
 * resvg does it, from its wasm build rather than the native one: the api's
 * node_modules are installed on Alpine and run on Debian, and a native addon
 * built for one libc does not load on the other. resvg has no system fonts, so
 * DejaVu Sans (what the static og image was drawn with) ships in assets/fonts.
 */

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

/** `svg` as a PNG `width` pixels wide. */
export async function renderPng(svg: string, width: number): Promise<Uint8Array<ArrayBuffer>> {
    const fontBuffers = await load()
    const resvg = new Resvg(svg, {
        font: { fontBuffers, defaultFontFamily: 'DejaVu Sans', loadSystemFonts: false },
        fitTo: { mode: 'width', value: width },
    })
    // Freed by hand: each render holds the fonts and a pixmap in wasm memory,
    // several MB that the GC has no reason to reclaim from such small wrappers
    // and that wasm never hands back once grown.
    try {
        const image = resvg.render()
        try {
            // Copied into a buffer of its own, which is what a response body takes.
            return new Uint8Array(image.asPng())
        } finally {
            image.free()
        }
    } finally {
        resvg.free()
    }
}

interface NamedGroup {
    id: string
    internalName: string
    displayName: string | null
}

const normalize = (s: string) => s.trim().toLowerCase()

/**
 * The groups a `?group=` value names, matched the way the web app's
 * `useGroupOverride` matches them: comma-separated, by scraped or display name,
 * case-insensitively, each with the label the app shows. Unknown names are
 * dropped, so nothing typed into a url is ever drawn on a card.
 */
export function resolveGroups(raw: string, groups: NamedGroup[]): { id: string; label: string }[] {
    const found: { id: string; label: string }[] = []
    for (const name of raw.split(',').map(normalize).filter(Boolean)) {
        const group = groups.find(
            (g) =>
                normalize(g.internalName) === name ||
                (g.displayName ? normalize(g.displayName) === name : false),
        )
        if (group && !found.some((f) => f.id === group.id)) {
            found.push({ id: group.id, label: group.displayName?.trim() || group.internalName })
        }
    }
    return found
}
