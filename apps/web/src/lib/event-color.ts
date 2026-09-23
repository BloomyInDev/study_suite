const HEX = /^#[0-9a-f]{6}$/i

/** The event's own scraped colour, as opposed to a Vuetify theme name. */
export function scrapedColor(color?: string | null): string | null {
    return color && HEX.test(color) ? color : null
}

const linear = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)

/**
 * Black or white, whichever WCAG contrasts better with `hex`.
 *
 * Vuetify derives a card's text colour from the theme for its own palette only.
 * Handed an arbitrary colour it paints the background and leaves the text at the
 * theme's on-surface: white under the dark theme, unreadable on the planning's
 * pastels. The threshold is where the two contrast ratios meet.
 */
export function textOn(hex: string): string {
    const [r, g, b] = [1, 3, 5].map((i) => linear(parseInt(hex.slice(i, i + 2), 16) / 255)) as [
        number,
        number,
        number,
    ]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.179 ? '#000000' : '#ffffff'
}
