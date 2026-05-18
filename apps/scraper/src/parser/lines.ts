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
  _knownGroupNames: Set<string>,
): CategorizedLines {
  const teacherIdxs = middleLines
    .map((l, i) => (isTeacherLine(l) ? i : -1))
    .filter(i => i !== -1)

  let roomsEnd: number
  let groupsStart: number

  if (teacherIdxs.length > 0) {
    roomsEnd = teacherIdxs[0]!
    groupsStart = teacherIdxs[teacherIdxs.length - 1]! + 1
  } else {
    const pathIdxs = middleLines
      .map((l, i) => (isPathLine(l) ? i : -1))
      .filter(i => i !== -1)
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

  const rooms: Location[] = middleLines
    .slice(0, roomsEnd)
    .filter(l => !isPathLine(l) && !isTeacherLine(l))
    .map(name => ({ name }))

  const teachers: Teacher[] = teacherIdxs.map(i => parseTeacherLine(middleLines[i]!))

  const groups: StudentGroup[] = middleLines
    .slice(groupsStart)
    .filter(l => !isPathLine(l) && !isTeacherLine(l))
    .map(internalName => ({ internalName }))

  return { rooms, teachers, groups }
}
