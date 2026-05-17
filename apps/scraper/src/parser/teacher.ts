import type { Teacher } from '@studysuite/shared'

// U+00A0 = non-breaking space, used as separator between LASTNAME and Firstname in Prose
const NBSP = String.fromCharCode(160)
const TEACHER_SEPARATOR = NBSP.repeat(3)
const TEACHER_REGEX = new RegExp('[A-Z ]+' + NBSP + '{3}[A-Z ]+')

export function isTeacherLine(line: string): boolean {
  return TEACHER_REGEX.test(line)
}

export function parseTeacherLine(line: string): Teacher {
  const [lastNameRaw, firstNameRaw] = line.split(TEACHER_SEPARATOR)
  return {
    lastName: lastNameRaw.trim(),
    firstName: toTitleCase((firstNameRaw ?? '').trim()),
  }
}

export function toTitleCase(str: string): string {
  return str
    .split(/([- ])/)
    .map(part => {
      if (part === '-' || part === ' ' || part.length === 0) return part
      return part[0].toUpperCase() + part.slice(1).toLowerCase()
    })
    .join('')
}
