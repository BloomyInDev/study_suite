import type { Teacher } from '@studysuite/shared'

// Separator after NBSP normalization: 3 regular spaces
const TEACHER_SEPARATOR = '   '

// Uppercase Latin-1 block (À-Ö U+00C0-D6, Ø-Þ U+00D8-DE), apostrophe, hyphen, space allowed
const TEACHER_REGEX = /^[A-ZÀ-ÖØ-Þ][A-ZÀ-ÖØ-Þ' \-]*   [A-ZÀ-ÖØ-Þ][A-ZÀ-ÖØ-Þ' \-]*$/

export function isTeacherLine(line: string): boolean {
    return TEACHER_REGEX.test(line)
}

export function parseTeacherLine(line: string): Teacher {
    const [lastNameRaw, firstNameRaw] = line.split(TEACHER_SEPARATOR)
    return {
        lastName: lastNameRaw!.trim(),
        firstName: toTitleCase((firstNameRaw ?? '').trim()),
    }
}

export function toTitleCase(str: string): string {
    return str
        .split(/([- ])/)
        .map((part) => {
            if (part === '-' || part === ' ' || part.length === 0) return part
            return part[0]!.toUpperCase() + part.slice(1).toLowerCase()
        })
        .join('')
}
