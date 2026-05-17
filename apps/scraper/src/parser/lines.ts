import type { Location, StudentGroup, Teacher } from '@studysuite/shared'
import { isTeacherLine, parseTeacherLine } from './teacher.js'

export interface CategorizedLines {
  rooms: Location[]
  teachers: Teacher[]
  groups: StudentGroup[]
}

export function categorizeLines(
  middleLines: string[],
  knownGroupNames: Set<string>,
): CategorizedLines {
  const teacherIndices = middleLines
    .map((l, i) => (isTeacherLine(l) ? i : -1))
    .filter(i => i !== -1)

  if (teacherIndices.length > 0) {
    const first = teacherIndices[0]
    const last = teacherIndices[teacherIndices.length - 1]
    return {
      rooms: middleLines.slice(0, first).filter(l => !isTeacherLine(l)).map(name => ({ name })),
      teachers: middleLines.filter(isTeacherLine).map(parseTeacherLine),
      groups: middleLines
        .slice(last + 1)
        .filter(l => !isTeacherLine(l))
        .map(internalName => ({ internalName })),
    }
  }

  // No teacher lines: split by first known group name.
  // v1 limitation: if DB is empty, all lines are treated as rooms.
  const firstGroupIdx = middleLines.findIndex(l => knownGroupNames.has(l))

  if (firstGroupIdx === -1) {
    return {
      rooms: middleLines.map(name => ({ name })),
      teachers: [],
      groups: [],
    }
  }

  return {
    rooms: middleLines.slice(0, firstGroupIdx).map(name => ({ name })),
    teachers: [],
    groups: middleLines.slice(firstGroupIdx).map(internalName => ({ internalName })),
  }
}
