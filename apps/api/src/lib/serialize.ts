import type { DateFormat } from '../schemas/query.js'

export function formatDate(d: Date, fmt: DateFormat): string | number {
    switch (fmt) {
        case 'iso':
            return d.toISOString()
        case 'unix':
            return Math.floor(d.getTime() / 1000)
        case 'unix-ms':
            return d.getTime()
    }
}

export type EventRow = {
    id: string
    title: string
    startDate: Date
    endDate: Date
    source: string
    eventLocations: { location: { id: string; name: string } }[]
    eventTeachers: { teacher: { id: string; firstName: string; lastName: string } }[]
    eventStudentGroups: { studentGroup: { id: string; internalName: string } }[]
}

export function eventToDto(row: EventRow, fmt: DateFormat) {
    return {
        id: row.id,
        title: row.title,
        startDate: formatDate(row.startDate, fmt),
        endDate: formatDate(row.endDate, fmt),
        source: row.source,
        rooms: row.eventLocations.map((el) => el.location),
        teachers: row.eventTeachers.map((et) => et.teacher),
        groups: row.eventStudentGroups.map((eg) => eg.studentGroup),
    }
}
