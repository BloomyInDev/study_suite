import type { Page } from 'playwright'

export interface RawEvent {
    rawText: string
    left: number
    /** `#rrggbb` the planning paints the event with, or null when it paints none. */
    color: string | null
}

export async function extractRawEvents(page: Page): Promise<RawEvent[]> {
    // Everything below runs in the page: nothing from module scope is reachable,
    // and it must stay free of *named* functions. tsx compiles with esbuild's
    // `keepNames`, which wraps every named function in a `__name(...)` helper
    // that exists in the bundle but not in the browser, so a `const f = () => …`
    // here throws `__name is not defined` at runtime.
    return page.$$eval('#Planning > div', (els) =>
        els.flatMap((el) => {
            const wrapper = el as HTMLElement
            const left = parseInt(wrapper.style.left, 10)
            const textEl = wrapper.querySelector<HTMLElement>('.eventText')
            const rawText = (textEl ?? wrapper).innerText.trim()
            if (!rawText) return []

            // The colour is the event's category. The planning paints it on
            // `table.event` inside the wrapper, which is itself transparent,
            // but reading the computed style of the wrapper and every
            // descendant covers a class, an inline style or either element,
            // without hard-coding which one carries it. First painted wins;
            // white loses to any other candidate, being also what an unpainted
            // element computes to.
            let color: string | null = null
            let fallback: string | null = null
            for (const node of [wrapper, ...wrapper.querySelectorAll<HTMLElement>('*')]) {
                const match = /^rgba?\(([^)]+)\)$/.exec(getComputedStyle(node).backgroundColor)
                if (!match) continue
                const parts = match[1]!.split(',')
                if (parts.length > 3 && parseFloat(parts[3]!) === 0) continue
                let hex = '#'
                for (const part of parts.slice(0, 3)) {
                    const n = Math.round(parseFloat(part))
                    if (!Number.isFinite(n)) break
                    hex += Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')
                }
                if (hex.length !== 7) continue
                if (hex !== '#ffffff') {
                    color = hex
                    break
                }
                fallback ??= hex
            }

            return [{ rawText, left, color: color ?? fallback }]
        }),
    )
}
