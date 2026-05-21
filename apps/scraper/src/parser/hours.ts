const HOURS_REGEX = /^(\d{1,2})h(\d{2})\s*-\s*(\d{1,2})h(\d{2})$/

export function parseHours(raw: string, dayDdMmYyyy: string): { start: Date; end: Date } | null {
    const match = HOURS_REGEX.exec(raw.trim())
    if (!match) return null

    const [, sh, sm, eh, em] = match
    const [d, mo, y] = dayDdMmYyyy.split('/').map((s) => parseInt(s, 10))
    const start = new Date(Date.UTC(y, mo - 1, d, +sh!, +sm!))
    const end = new Date(Date.UTC(y, mo - 1, d, +eh!, +em!))

    if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf())) return null
    if (end <= start) return null

    return { start, end }
}
