import type { Location, StudentGroup, Teacher } from '@studysuite/shared'
import { isTeacherLine, parseTeacherLine } from './teacher.js'

export interface CategorizedLines {
    rooms: Location[]
    teachers: Teacher[]
    groups: StudentGroup[]
}

/** The building hierarchy printed under a room: `Montpellier / … / K / 1`. */
const PATH_REGEX = / \/ /

export const isPathLine = (line: string): boolean => PATH_REGEX.test(line)

/**
 * Rooms the planning names with their path line under them. A room drawn
 * *without* one reads like a group when the event has no teacher, so it helps
 * to know the name from elsewhere in the same fetch.
 */
export function roomsWithPath(lineSets: readonly string[][]): Set<string> {
    const rooms = new Set<string>()
    for (const lines of lineSets) {
        lines.forEach((line, i) => {
            const next = lines[i + 1]
            if (next !== undefined && isPathLine(next) && !isPathLine(line)) rooms.add(line)
        })
    }
    return rooms
}

/**
 * Sorts the lines between the title and the hours into rooms, teachers and
 * groups. The planning prints them flat, in that order: rooms (each followed
 * by its path line, usually), teachers, groups. Ported from the Playwright
 * scraper, which read the same lines off the DOM.
 *
 * Teachers are recognisable on their own, so they bound the other two. Without
 * one, the boundary is the last path line, which misreads a trailing room
 * that has no path line of its own as a group (how `Salle 007` once became a
 * student group). `knownRooms` settles those: a name seen as a room elsewhere
 * is a room here too.
 */
export function categorizeLines(
    middleLines: string[],
    knownRooms: ReadonlySet<string>,
): CategorizedLines {
    const teacherIdxs = middleLines.flatMap((l, i) => (isTeacherLine(l) ? [i] : []))

    let roomsEnd: number
    let groupsStart: number
    if (teacherIdxs.length > 0) {
        roomsEnd = teacherIdxs[0]!
        groupsStart = teacherIdxs[teacherIdxs.length - 1]! + 1
    } else {
        const pathIdxs = middleLines.flatMap((l, i) => (isPathLine(l) ? [i] : []))
        // No teacher and no path: everything is a group (e.g. all-hands events).
        const lastPath = pathIdxs.length > 0 ? pathIdxs[pathIdxs.length - 1]! + 1 : 0
        roomsEnd = lastPath
        groupsStart = lastPath
    }

    const keep = (l: string) => !isPathLine(l) && !isTeacherLine(l)
    const roomLines = middleLines.slice(0, roomsEnd).filter(keep)
    const groupLines = middleLines.slice(groupsStart).filter(keep)

    return {
        rooms: [...roomLines, ...groupLines.filter((l) => knownRooms.has(l))].map((name) => ({
            name,
        })),
        teachers: teacherIdxs.map((i) => parseTeacherLine(middleLines[i]!)),
        groups: groupLines
            .filter((l) => !knownRooms.has(l))
            .map((internalName) => ({ internalName })),
    }
}
