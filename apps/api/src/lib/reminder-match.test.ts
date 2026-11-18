import { describe, expect, it } from 'vitest'

import {
    buildPayload,
    duePairs,
    formatHour,
    type Subscriber,
    type UpcomingEvent,
} from './reminder-match.js'

const SUMMER = new Date('2026-09-07T08:00:00.000Z') // 10h00 Paris, CEST
const WINTER = new Date('2026-01-15T09:00:00.000Z') // 10h00 Paris, CET

const minutesBefore = (start: Date, m: number) => new Date(start.getTime() - m * 60_000)

const event = (over: Partial<UpcomingEvent> = {}): UpcomingEvent => ({
    id: 'e1',
    title: 'R5.05 — Programmation système',
    startDate: SUMMER,
    eventLocations: [{ location: { name: 'Salle 007' } }],
    eventTeachers: [{ teacher: { firstName: 'Jean', lastName: 'DUPONT' } }],
    eventStudentGroups: [{ studentGroup: { id: 'g-but3a' } }],
    ...over,
})

const subscriber = (over: Partial<Subscriber> = {}): Subscriber => ({
    id: 's1',
    groupIds: ['g-but3a'],
    leadMinutes: 15,
    excludedTitles: [],
    ...over,
})

describe('formatHour', () => {
    it.each([
        [SUMMER, '10:00'],
        [WINTER, '10:00'],
    ])('shows the hour the planning shows, either side of DST (%s)', (start, expected) => {
        expect(formatHour(start)).toBe(expected)
    })
})

describe('duePairs', () => {
    const sub = subscriber()
    const e = event()

    it('stays quiet before the reminder point', () => {
        expect(duePairs([sub], [e], minutesBefore(SUMMER, 16))).toHaveLength(0)
    })

    it('fires once the reminder point is reached', () => {
        expect(duePairs([sub], [e], minutesBefore(SUMMER, 15))).toHaveLength(1)
    })

    // A missed tick must not lose the reminder: the window stays open until the
    // course starts, and the caller's claim table stops the repeat.
    it('still fires for a tick that was missed', () => {
        expect(duePairs([sub], [e], minutesBefore(SUMMER, 3))).toHaveLength(1)
    })

    it('gives up once the course has started', () => {
        expect(duePairs([sub], [e], SUMMER)).toHaveLength(0)
        expect(duePairs([sub], [e], new Date(SUMMER.getTime() + 60_000))).toHaveLength(0)
    })

    it("honours each subscriber's own lead time", () => {
        const early = subscriber({ id: 's-early', leadMinutes: 60 })
        const late = subscriber({ id: 's-late', leadMinutes: 5 })
        const at30 = minutesBefore(SUMMER, 30)

        expect(duePairs([early, late], [e], at30).map((p) => p.sub.id)).toEqual(['s-early'])
    })

    it('ignores events for other groups', () => {
        const other = event({ eventStudentGroups: [{ studentGroup: { id: 'g-but1' } }] })
        expect(duePairs([sub], [other], minutesBefore(SUMMER, 10))).toHaveLength(0)
    })

    it("matches on any of the subscriber's groups, ancestors included", () => {
        const lecture = event({ eventStudentGroups: [{ studentGroup: { id: 'g-but3' } }] })
        const withAncestor = subscriber({ groupIds: ['g-but3a', 'g-but3'] })
        expect(duePairs([withAncestor], [lecture], minutesBefore(SUMMER, 10))).toHaveLength(1)
    })

    it('skips a visitor who has picked no group', () => {
        expect(
            duePairs([subscriber({ groupIds: [] })], [e], minutesBefore(SUMMER, 10)),
        ).toHaveLength(0)
    })

    it('skips a course the user hid, and only that one', () => {
        const hid = subscriber({ excludedTitles: [e.title] })
        const other = event({ id: 'e2', title: 'Anglais' })
        const due = duePairs([hid], [e, other], minutesBefore(SUMMER, 10))
        expect(due.map((p) => p.event.id)).toEqual(['e2'])
    })
})

describe('buildPayload', () => {
    it('counts the minutes and reads the hour the same in both seasons', () => {
        for (const start of [SUMMER, WINTER]) {
            const payload = buildPayload(event({ startDate: start }), minutesBefore(start, 15))
            expect(payload.body).toBe('Dans 15 min · 10:00 · Salle 007 · DUPONT Jean')
        }
    })

    it('says "Maintenant" rather than "Dans 0 min"', () => {
        const payload = buildPayload(event(), new Date(SUMMER.getTime() - 20_000))
        expect(payload.body.startsWith('Maintenant · ')).toBe(true)
    })

    it('drops the empty parts when a course has no room or teacher', () => {
        const bare = event({ eventLocations: [], eventTeachers: [] })
        expect(buildPayload(bare, minutesBefore(SUMMER, 10)).body).toBe('Dans 10 min · 10:00')
    })
})
