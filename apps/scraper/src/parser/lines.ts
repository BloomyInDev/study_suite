import type { Location, StudentGroup, Teacher } from '@studysuite/shared'
import { isTeacherLine, parseTeacherLine } from './teacher.js'

export interface CategorizedLines {
    rooms: Location[]
    teachers: Teacher[]
    groups: StudentGroup[]
}

// A path line is the building hierarchy; recognizable by ' / ' after NBSP normalization
const PATH_REGEX = / \/ /

function isPathLine(line: string): boolean {
    return PATH_REGEX.test(line)
}

export function categorizeLines(
    middleLines: string[],
    knownGroupNames: Set<string>,
    strictGroups = false,
): CategorizedLines {
    const teacherIdxs = middleLines
        .map((l, i) => (isTeacherLine(l) ? i : -1))
        .filter((i) => i !== -1)

    let roomsEnd: number
    let groupsStart: number

    if (teacherIdxs.length > 0) {
        roomsEnd = teacherIdxs[0]!
        groupsStart = teacherIdxs[teacherIdxs.length - 1]! + 1
    } else {
        const pathIdxs = middleLines.map((l, i) => (isPathLine(l) ? i : -1)).filter((i) => i !== -1)
        if (pathIdxs.length > 0) {
            const lastP = pathIdxs[pathIdxs.length - 1]!
            roomsEnd = lastP + 1
            groupsStart = lastP + 1
        } else {
            // No teacher, no path — treat everything as groups (e.g. all-hands events)
            roomsEnd = 0
            groupsStart = 0
        }
    }

    const roomLines = middleLines
        .slice(0, roomsEnd)
        .filter((l) => !isPathLine(l) && !isTeacherLine(l))

    const teachers: Teacher[] = teacherIdxs.map((i) => parseTeacherLine(middleLines[i]!))

    const groupLines = middleLines
        .slice(groupsStart)
        .filter((l) => !isPathLine(l) && !isTeacherLine(l))

    // An empty table means the groups have not been discovered yet; enforcing
    // strict mode there would reject every line.
    const strict = strictGroups && knownGroupNames.size > 0
    if (strictGroups && knownGroupNames.size === 0) {
        console.warn('[parser] strictGroups is on but no groups are known yet — ignoring it')
    }

    // Without a teacher line the boundary is the last path line, so anything the
    // site lists after it looks like a group. In practice that is a trailing room
    // whose path line the site omitted, so unknown names are read as rooms.
    const groups: StudentGroup[] = []
    const reclassified: string[] = []
    for (const line of groupLines) {
        if (!strict || knownGroupNames.has(line)) groups.push({ internalName: line })
        else reclassified.push(line)
    }
    for (const line of reclassified) {
        console.warn(`[parser] "${line}" is not a known group, reading it as a room`)
    }

    const rooms: Location[] = [...roomLines, ...reclassified].map((name) => ({ name }))

    return { rooms, teachers, groups }
}
