import type { DateFormat } from '../schemas/query.js'

export const withEventRelations = {
    eventLocations: { with: { location: true as const } },
    eventTeachers: { with: { teacher: true as const } },
    eventStudentGroups: { with: { studentGroup: true as const } },
}

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
    eventStudentGroups: { studentGroup: { id: string; internalName: string; displayName: string | null } }[]
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

/** The `diff` column of an `updated` change, as the reconciler writes it. */
interface UpdatedDiff {
    before: {
        rooms: string[]
        teachers: { firstName: string; lastName: string }[]
        groups: string[]
    }
    after: {
        rooms: string[]
        teachers: { firstName: string; lastName: string }[]
        groups: string[]
    }
}

export type EventChangeRow = {
    id: string
    changeType: 'added' | 'removed' | 'updated' | 'moved'
    eventTitle: string
    startDate: Date
    endDate: Date
    groups: string[]
    diff: unknown
    detectedAt: Date
}

export function eventChangeToDto(row: EventChangeRow, fmt: DateFormat) {
    // `moved` and `updated` both live in the `diff` column but hold different
    // shapes; splitting them here keeps the client from having to know that.
    const moved =
        row.changeType === 'moved'
            ? (row.diff as { newStart: string; newEnd: string } | null)
            : null

    return {
        id: row.id,
        changeType: row.changeType,
        title: row.eventTitle,
        startDate: formatDate(row.startDate, fmt),
        endDate: formatDate(row.endDate, fmt),
        newStartDate: moved ? formatDate(new Date(moved.newStart), fmt) : null,
        newEndDate: moved ? formatDate(new Date(moved.newEnd), fmt) : null,
        groups: row.groups,
        diff: row.changeType === 'updated' ? (row.diff as UpdatedDiff | null) : null,
        // A real instant, unlike the wall-clock labels above.
        detectedAt: row.detectedAt.toISOString(),
    }
}
