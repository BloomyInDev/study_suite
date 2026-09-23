import type { Location, ParsedEvent, StudentGroup, Teacher } from '@studysuite/shared'
import { toWallClock } from '@studysuite/shared/time'
import { isTeacherLine, parseTeacherLine } from '../parser/teacher.js'

/**
 * VEVENT → `ParsedEvent`.
 *
 * The iCal carries the same three kinds of line the planning page rendered, but
 * already separated: the room is `LOCATION`, and `DESCRIPTION` holds the
 * teachers and the groups. That is why the old `strictGroups` escape hatch is
 * gone. The room/group boundary was a property of reading the DOM, where a
 * trailing room with no path line of its own looked like a group.
 */

/** Continuation lines start with a space or tab (RFC 5545 §3.1). */
const unfold = (ics: string): string => ics.replace(/\r?\n[ \t]/g, '')

const unescapeText = (value: string): string =>
    value.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\')

/**
 * Status and bookkeeping lines ADE mixes into `DESCRIPTION`. They are not
 * groups, and the planning page did not show them either.
 */
const isMetaLine = (line: string): boolean =>
    line.startsWith('#') ||
    line.startsWith('(Exported') ||
    line === 'A valider' ||
    /^Transf/i.test(line)

function parseIcalInstant(value: string): Date | null {
    const m = /(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/.exec(value)
    if (!m) return null
    return new Date(
        Date.UTC(
            Number(m[1]),
            Number(m[2]) - 1,
            Number(m[3]),
            Number(m[4]),
            Number(m[5]),
            Number(m[6]),
        ),
    )
}

/** The lines of `DESCRIPTION`, normalised but **not** whitespace-collapsed. */
function descriptionLines(raw: string): string[] {
    return unescapeText(raw)
        .replace(/\u00a0/g, ' ')
        .split('\n')
        .map((l) => l.replace(/^\s+|\s+$/g, ''))
        .filter((l) => l.length > 0)
}

function property(body: string, name: string): string {
    const m = new RegExp(`^${name}[^:]*:(.*)$`, 'm').exec(body)
    return m ? m[1]!.trim() : ''
}

export function parseCalendar(ics: string): ParsedEvent[] {
    const events: ParsedEvent[] = []

    for (const block of unfold(ics).split('BEGIN:VEVENT').slice(1)) {
        const end = block.indexOf('END:VEVENT')
        const body = end === -1 ? block : block.slice(0, end)

        const startInstant = parseIcalInstant(property(body, 'DTSTART'))
        const endInstant = parseIcalInstant(property(body, 'DTEND'))
        if (!startInstant || !endInstant) continue

        const title = unescapeText(property(body, 'SUMMARY')).trim()
        if (!title) continue

        // ADE overloads the comma as a room separator inside what RFC 5545
        // says is a single TEXT value, so it arrives escaped: `K041\,K131`.
        // A room whose own name held a comma would be encoded identically and
        // is therefore indistinguishable either way, and splitting on the
        // escaped form just keeps the escape treated as structure. On the
        // current planning the two orders agree on all 2475 events.
        const rawLocation = property(body, 'LOCATION')
        const rooms: Location[] = rawLocation
            .split('\\,')
            .map((name) => unescapeText(name).trim())
            .filter((name) => name.length > 0)
            .map((name) => ({ name }))

        // Trimmed at the ends only. Collapsing inner whitespace would destroy
        // the three-space separator `isTeacherLine` keys on, and every teacher
        // would fall through to the group list.
        const lines = descriptionLines(property(body, 'DESCRIPTION'))
        const teachers: Teacher[] = lines.filter(isTeacherLine).map(parseTeacherLine)
        const groups: StudentGroup[] = lines
            .filter((l) => !isMetaLine(l) && !isTeacherLine(l))
            .map((internalName) => ({ internalName }))

        events.push({
            title,
            // Stored as Paris wall-clock labelled UTC, like everything else in
            // `events` (see the Time section of AGENTS.md). `DTSTART` is a real
            // instant, so it has to be converted, never written through.
            startDate: toWallClock(startInstant),
            endDate: toWallClock(endInstant),
            rooms,
            teachers,
            groups,
        })
    }

    return events
}
