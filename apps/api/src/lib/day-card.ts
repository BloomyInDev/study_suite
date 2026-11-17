import { scrapedColor, textOn } from '@studysuite/shared/color'
import { PLANNING_TZ, parisParts } from '@studysuite/shared/time'

/**
 * The card a shared planning link unfurls with: one day of a group's planning,
 * drawn the way the planning's day view draws it on a phone (an hour gutter,
 * one coloured block per course, detail lines dropped when a block is short).
 *
 * Portrait, because a day is a column: 9:16, laid out on a 450×800 grid and
 * rendered at twice that. Pure, so the layout is testable without a database or
 * resvg; `og-card.ts` turns the SVG into a PNG.
 */

export const CARD_WIDTH = 450
export const CARD_HEIGHT = 800

export interface CardEvent {
    title: string
    start: Date
    end: Date
    /** The planning's `#rrggbb`, or null when it painted none. */
    color: string | null
    teachers: string[]
    rooms: string[]
}

export interface DayCard {
    /** The groups' labels, as the page names them. */
    labels: string[]
    /** Any instant in the Paris day shown. */
    day: Date
    events: CardEvent[]
    /** The public host, printed small at the bottom. */
    host?: string
}

const PRIMARY = '#1867c0'
const ACCENT = '#ffb300'
const INK = '#1f1f1f'
const MUTED = '#616161'
const RULE = '#e0e0e0'

const BAR_HEIGHT = 56
const GRID_TOP = 150
const GRID_BOTTOM = 770
const GUTTER = 52
const GRID_RIGHT = CARD_WIDTH - 12
const BLOCK_PAD = 6
const COLUMN_GAP = 3

/**
 * The day view's default span, widened when a course falls outside it. Like the
 * planning, the hours labelled run from 8:00 to 19:00.
 */
const FIRST_HOUR = 8
const LAST_HOUR = 20

const escapeXml = (s: string) => s.replace(/[<>&"']/g, (ch) => `&#${ch.charCodeAt(0)};`)

/**
 * DejaVu Sans' advance for a character, as a fraction of the font size. SVG
 * has no text overflow, so the width is estimated. By class rather than by
 * glyph: capitals run far wider than lower case, and a teacher's name is
 * mostly capitals.
 */
function advance(ch: string, bold: boolean): number {
    let a: number
    if (ch === ' ') a = 0.32
    else if (/[ilj.,:;'|!]/.test(ch)) a = 0.3
    else if (/[A-ZÀ-Þ]/.test(ch)) a = 0.72
    else if (/[0-9]/.test(ch)) a = 0.64
    else if (/[mwMW]/.test(ch)) a = 0.92
    else a = 0.6
    return bold ? a * 1.1 : a
}

export function textWidth(text: string, size: number, bold = false): number {
    let width = 0
    for (const ch of text) width += advance(ch, bold) * size
    return width
}

/** `text`, cut with an ellipsis so it fits `width` at `size`. */
export function clip(text: string, width: number, size: number, bold = false): string {
    if (textWidth(text, size, bold) <= width) return text
    const chars = [...text]
    while (chars.length > 1 && textWidth(`${chars.join('')}…`, size, bold) > width) chars.pop()
    return `${chars.join('').trimEnd()}…`
}

/** Fractional Paris hours since midnight, so 13h45 is 13.75. */
const parisHour = (d: Date) => {
    const { hour, minute } = parisParts(d)
    return hour + minute / 60
}

const pad = (n: number) => String(n).padStart(2, '0')
const hhmm = (d: Date) => {
    const { hour, minute } = parisParts(d)
    return `${pad(hour)}:${pad(minute)}`
}

const dayFormat = new Intl.DateTimeFormat('fr-FR', {
    timeZone: PLANNING_TZ,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
})

/** "Mardi 17 novembre". */
export function dayTitle(day: Date): string {
    const text = dayFormat.format(day)
    return text.charAt(0).toUpperCase() + text.slice(1)
}

/** The hours the grid spans: the default day, widened to every course. */
export function hourRange(events: CardEvent[]): { first: number; last: number } {
    let first = FIRST_HOUR
    let last = LAST_HOUR
    for (const e of events) {
        first = Math.min(first, Math.floor(parisHour(e.start)))
        last = Math.max(last, Math.ceil(parisHour(e.end)))
    }
    return { first, last: Math.min(last, 24) }
}

export interface Placed {
    event: CardEvent
    /** 0-based column within its group of overlapping courses. */
    column: number
    /** How many columns that group needs. */
    columns: number
}

/**
 * Side by side when courses overlap, like the planning's `column` overlap
 * mode: each run of chained overlaps shares its width, and a course takes the
 * first column free by its start.
 */
export function placeEvents(events: CardEvent[]): Placed[] {
    const sorted = [...events].sort(
        (a, b) => a.start.getTime() - b.start.getTime() || b.end.getTime() - a.end.getTime(),
    )
    const placed: Placed[] = []
    // The run being built: its courses, where it ends, and where each of its
    // columns is free again.
    let cluster: Placed[] = []
    let clusterEnd = -Infinity
    let columnEnds: number[] = []

    const close = () => {
        for (const p of cluster) p.columns = columnEnds.length
        cluster = []
        clusterEnd = -Infinity
        columnEnds = []
    }

    for (const event of sorted) {
        const start = event.start.getTime()
        if (start >= clusterEnd) close()
        let column = columnEnds.findIndex((end) => end <= start)
        if (column === -1) column = columnEnds.push(0) - 1
        columnEnds[column] = event.end.getTime()
        clusterEnd = Math.max(clusterEnd, event.end.getTime())
        const p = { event, column, columns: 1 }
        cluster.push(p)
        placed.push(p)
    }
    close()
    return placed
}

/** At most three groups by name, then a count of the rest. */
export function headline(labels: string[]): string {
    const listed = labels.slice(0, 3).join(', ')
    return labels.length > 3 ? `${listed} +${labels.length - 3}` : listed
}

/** The text lines a block of `height` px has room for, most important first. */
function blockLines(e: CardEvent, width: number, height: number) {
    const candidates = [
        { text: `${hhmm(e.start)} - ${hhmm(e.end)}`, size: 12, bold: true, lineHeight: 16 },
        { text: e.title, size: 15, bold: false, lineHeight: 19 },
        { text: e.teachers.join(', '), size: 12, bold: false, lineHeight: 16 },
        { text: e.rooms.join(', '), size: 12, bold: false, lineHeight: 16 },
    ].filter((l) => l.text.length > 0)

    const lines: { text: string; size: number; bold: boolean; y: number }[] = []
    let used = BLOCK_PAD
    for (const [i, line] of candidates.entries()) {
        // The time always shows, even clipped: a block with no text reads as a glitch.
        if (i > 0 && used + line.lineHeight > height - BLOCK_PAD / 2) break
        used += line.lineHeight
        lines.push({
            text: clip(line.text, width - 2 * BLOCK_PAD, line.size, line.bold),
            size: line.size,
            bold: line.bold,
            y: used - 4,
        })
    }
    return lines
}

export function dayCardSvg(card: DayCard): string {
    const { first, last } = hourRange(card.events)
    const perHour = (GRID_BOTTOM - GRID_TOP) / (last - first)
    const yAt = (d: Date) => GRID_TOP + (parisHour(d) - first) * perHour

    const parts: string[] = []
    const push = (s: string) => parts.push(s)

    push(`<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="#ffffff" />`)

    // The app bar, with the favicon mark.
    push(`<rect width="${CARD_WIDTH}" height="${BAR_HEIGHT}" fill="${PRIMARY}" />`)
    push(`<g transform="translate(16 12) scale(0.5)">
        <rect width="64" height="64" rx="14" fill="#2979d4" />
        <rect x="12" y="12" width="16" height="26" rx="4" fill="#ffffff" />
        <rect x="36" y="12" width="16" height="14" rx="4" fill="#ffffff" opacity=".6" />
        <rect x="12" y="44" width="16" height="8" rx="4" fill="#ffffff" opacity=".6" />
        <rect x="36" y="32" width="16" height="20" rx="4" fill="${ACCENT}" />
    </g>`)
    push(`<text x="60" y="35" fill="#ffffff" font-size="19">Study Suite</text>`)

    // Whose planning, and which day.
    // The largest size up to 28 at which it fits, then cut below 18.
    const title = `Planning ${headline(card.labels)}`
    const fitted = Math.floor((28 * (CARD_WIDTH - 40)) / textWidth(title, 28, true))
    const titleSize = Math.max(18, Math.min(28, fitted))
    push(
        `<text x="20" y="${BAR_HEIGHT + 42}" fill="${INK}" font-size="${titleSize}" font-weight="bold">${escapeXml(clip(title, CARD_WIDTH - 40, titleSize, true))}</text>`,
    )
    push(
        `<text x="20" y="${BAR_HEIGHT + 70}" fill="${PRIMARY}" font-size="16">${escapeXml(dayTitle(card.day))}</text>`,
    )

    // The hour grid.
    for (let h = first; h <= last; h++) {
        const y = GRID_TOP + (h - first) * perHour
        push(`<line x1="${GUTTER}" y1="${y}" x2="${GRID_RIGHT}" y2="${y}" stroke="${RULE}" />`)
        if (h < last) {
            push(
                `<text x="${GUTTER - 8}" y="${y + 4}" fill="${MUTED}" font-size="11" text-anchor="end">${h}:00</text>`,
            )
        }
    }
    push(
        `<line x1="${GUTTER}" y1="${GRID_TOP}" x2="${GUTTER}" y2="${GRID_BOTTOM}" stroke="${RULE}" />`,
    )

    if (card.events.length === 0) {
        const mid = (GRID_TOP + GRID_BOTTOM) / 2
        push(
            `<rect x="${GUTTER + 24}" y="${mid - 34}" width="${GRID_RIGHT - GUTTER - 48}" height="68" rx="8" fill="#f5f5f5" />`,
        )
        push(
            `<text x="${(GUTTER + GRID_RIGHT) / 2}" y="${mid + 6}" fill="${MUTED}" font-size="17" text-anchor="middle">Pas de cours ce jour-là</text>`,
        )
    }

    // The courses.
    const span = GRID_RIGHT - GUTTER - 4
    for (const { event, column, columns } of placeEvents(card.events)) {
        const width = span / columns - (columns > 1 ? COLUMN_GAP : 0)
        const x = GUTTER + 4 + column * (span / columns)
        const y = yAt(event.start) + 1
        const height = Math.max(14, yAt(event.end) - yAt(event.start) - 2)
        const fill = scrapedColor(event.color) ?? PRIMARY
        const ink = textOn(fill)
        push(`<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="4" fill="${fill}" />`)
        for (const line of blockLines(event, width, height)) {
            push(
                `<text x="${x + BLOCK_PAD}" y="${y + line.y}" fill="${ink}" font-size="${line.size}"${line.bold ? ' font-weight="bold"' : ''}>${escapeXml(line.text)}</text>`,
            )
        }
    }

    if (card.host) {
        push(
            `<text x="${CARD_WIDTH - 12}" y="${CARD_HEIGHT - 12}" fill="${MUTED}" font-size="11" text-anchor="end">${escapeXml(card.host)}</text>`,
        )
    }
    push(`<rect x="20" y="${CARD_HEIGHT - 18}" width="56" height="5" rx="2.5" fill="${ACCENT}" />`)

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">
<g font-family="DejaVu Sans">
${parts.join('\n')}
</g>
</svg>`
}
