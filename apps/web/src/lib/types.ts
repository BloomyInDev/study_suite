export interface Teacher {
  id: string
  firstName: string
  lastName: string
}

export interface Room {
  id: string
  name: string
}

export interface Group {
  id: string
  internalName: string
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

export enum Duration {
  DAY = 'day',
  WEEK = 'week',
}
