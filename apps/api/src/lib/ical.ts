/**
 * Minimal RFC 5545 writer — enough for a read-only subscription feed.
 *
 * Event timestamps are stored as Paris wall-clock labelled UTC (the scraper
 * builds them with `Date.UTC` from what the planning page displays), so the
 * UTC getters give back the hour a student actually reads on the site. They are
 * emitted with `TZID=Europe/Paris` rather than as `Z` instants, which is what
 * that hour means; a `Z` would shift every course by one or two hours.
 */

const TZID = 'Europe/Paris'

const VTIMEZONE = [
    'BEGIN:VTIMEZONE',
    `TZID:${TZID}`,
    'X-LIC-LOCATION:Europe/Paris',
    'BEGIN:DAYLIGHT',
    'TZOFFSETFROM:+0100',
    'TZOFFSETTO:+0200',
    'TZNAME:CEST',
    'DTSTART:19700329T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
    'END:DAYLIGHT',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:+0200',
    'TZOFFSETTO:+0100',
    'TZNAME:CET',
    'DTSTART:19701025T030000',
    'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
    'END:STANDARD',
    'END:VTIMEZONE',
]

function pad(n: number): string {
    return String(n).padStart(2, '0')
}

/** Local date-time form (no trailing Z): pairs with a TZID parameter. */
function localStamp(d: Date): string {
    return (
        `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
        `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`
    )
}

/** UTC form, for the properties that are true instants (DTSTAMP, LAST-MODIFIED). */
function utcStamp(d: Date): string {
    return `${localStamp(d)}Z`
}

function escapeText(value: string): string {
    return value
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\r?\n/g, '\\n')
}

/** RFC 5545 §3.1: fold to 75 octets, continuation lines start with a space. */
function fold(line: string): string {
    const bytes = Buffer.from(line, 'utf8')
    if (bytes.length <= 75) return line
    const chunks: string[] = []
    let offset = 0
    let limit = 75
    while (offset < bytes.length) {
        // Never split a multi-byte character: back off until the slice decodes clean.
        let end = Math.min(offset + limit, bytes.length)
        while (end > offset && (bytes[end]! & 0xc0) === 0x80) end--
        chunks.push(bytes.subarray(offset, end).toString('utf8'))
        offset = end
        limit = 74 // continuation lines spend one octet on the leading space
    }
    return chunks.join('\r\n ')
}

export type CalendarEvent = {
    id: string
    title: string
    startDate: Date
    endDate: Date
    updatedAt?: Date
    rooms: { name: string }[]
    teachers: { firstName: string; lastName: string }[]
    groups: { internalName: string; displayName: string | null }[]
}

export type CalendarOptions = {
    name: string
    /** Host part of the UIDs, so they stay unique across deployments. */
    domain: string
}

export function buildCalendar(events: CalendarEvent[], { name, domain }: CalendarOptions): string {
    const now = new Date()
    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//StudySuite//Planning//FR',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        `X-WR-CALNAME:${escapeText(name)}`,
        `X-WR-TIMEZONE:${TZID}`,
        ...VTIMEZONE,
    ]

    for (const event of events) {
        const teachers = event.teachers.map((t) => `${t.firstName} ${t.lastName}`)
        const groups = event.groups.map((g) => g.displayName ?? g.internalName)
        const rooms = event.rooms.map((r) => r.name)
        const description = [
            teachers.length > 0 ? `Enseignants : ${teachers.join(', ')}` : null,
            groups.length > 0 ? `Groupes : ${groups.join(', ')}` : null,
            rooms.length > 0 ? `Salles : ${rooms.join(', ')}` : null,
        ]
            .filter((l) => l !== null)
            .join('\n')

        lines.push(
            'BEGIN:VEVENT',
            `UID:${event.id}@${domain}`,
            `DTSTAMP:${utcStamp(now)}`,
            `LAST-MODIFIED:${utcStamp(event.updatedAt ?? now)}`,
            `DTSTART;TZID=${TZID}:${localStamp(event.startDate)}`,
            `DTEND;TZID=${TZID}:${localStamp(event.endDate)}`,
            `SUMMARY:${escapeText(event.title)}`,
        )
        if (rooms.length > 0) lines.push(`LOCATION:${escapeText(rooms.join(', '))}`)
        if (description) lines.push(`DESCRIPTION:${escapeText(description)}`)
        lines.push('TRANSP:OPAQUE', 'END:VEVENT')
    }

    lines.push('END:VCALENDAR')
    return `${lines.map(fold).join('\r\n')}\r\n`
}
