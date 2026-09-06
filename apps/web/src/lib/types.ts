export interface Teacher {
    id: string
    firstName: string
    lastName: string
    available?: boolean
}

export interface Room {
    id: string
    name: string
}

export interface Group {
    id: string
    internalName: string
    displayName?: string | null
    hidden?: boolean
    parents?: GroupRef[]
    children?: GroupRef[]
}

export interface GroupRef {
    id: string
    internalName: string
    displayName?: string | null
}

export interface ApiEvent {
    id: string
    title: string
    startDate: string | number
    endDate: string | number
    source: string
    rooms: Room[]
    teachers: Teacher[]
    groups: Group[]
}

export interface Event extends Omit<ApiEvent, 'startDate' | 'endDate'> {
    start: Date
    end: Date
}

export interface TeacherWithDetails extends Teacher {
    available: boolean
    currentEvent: Event | null
    todayEvents: Event[]
}

export interface RoomWithDetails extends Room {
    available: boolean
    todayEvents: Event[]
}

export function enhanceEvent(e: ApiEvent): Event {
    return { ...e, start: new Date(e.startDate), end: new Date(e.endDate) }
}

export interface Assignment {
    id: string
    title: string
    subject: string | null
    description: string | null
    dueDate: string
    studentGroup: { id: string; internalName: string; displayName?: string | null }
    event: { id: string; title: string } | null
    createdBy: { id: string; discordUsername: string } | null
    updatedBy: { id: string; discordUsername: string } | null
    completedByMe: boolean
    completionCount: number
    createdAt: string
    updatedAt: string
}

export enum Duration {
    DAY = 'day',
    WEEK = 'week',
}

export type ChangeType = 'added' | 'removed' | 'updated' | 'moved'

export interface ChangeRelations {
    rooms: string[]
    teachers: { firstName: string; lastName: string }[]
    groups: string[]
}

export interface ApiEventChange {
    id: string
    changeType: ChangeType
    title: string
    startDate: string | number
    endDate: string | number
    newStartDate: string | number | null
    newEndDate: string | number | null
    groups: string[]
    diff: { before: ChangeRelations; after: ChangeRelations } | null
    detectedAt: string
}

export interface EventChange extends Omit<
    ApiEventChange,
    'startDate' | 'endDate' | 'newStartDate' | 'newEndDate'
> {
    /** Wall-clock, like every event timestamp — display with the UTC getters. */
    start: Date
    end: Date
    newStart: Date | null
    newEnd: Date | null
}

export function enhanceChange(c: ApiEventChange): EventChange {
    return {
        ...c,
        start: new Date(c.startDate),
        end: new Date(c.endDate),
        newStart: c.newStartDate === null ? null : new Date(c.newStartDate),
        newEnd: c.newEndDate === null ? null : new Date(c.newEndDate),
    }
}
