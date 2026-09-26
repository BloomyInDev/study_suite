import { defineStore } from 'pinia'
import { backend } from '../lib/api.js'
import {
    Duration,
    enhanceChange,
    enhanceEvent,
    type Event,
    type EventChange,
} from '../lib/types.js'
import { mondayOfWeek, toIsoDateString } from '../lib/date.js'

interface CachedEvents {
    events: Event[]
    fetchedAt: number
}

const CACHE_TTL = 5 * 60 * 1000

const pad = (n: number) => n.toString().padStart(2, '0')

const toUtcDateKey = (d: Date) =>
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`

const buildCacheKey = (
    groupIds: string[],
    duration: Duration,
    date: Date,
    excludeTitles: string[],
): string => {
    const gKey = [...groupIds].sort().join(',')
    const dKey = duration === Duration.WEEK ? toUtcDateKey(mondayOfWeek(date)) : toUtcDateKey(date)
    const tKey = [...excludeTitles].sort().join('\n')
    return `${gKey}-${duration}-${dKey}-${tKey}`
}

/** The `excludeTitle` query param, left out entirely when nothing is hidden. */
const excludeQuery = (titles: string[]) => (titles.length > 0 ? { excludeTitle: titles } : {})

export const useEventsStore = defineStore('events', {
    state: () => ({
        cache: new Map<string, CachedEvents>(),
        loading: false,
    }),

    getters: {
        isLoading: (state) => state.loading,
    },

    actions: {
        isCacheValid(key: string): boolean {
            const c = this.cache.get(key)
            return !!c && Date.now() - c.fetchedAt < CACHE_TTL
        },

        getCached(
            groupIds: string[],
            duration: Duration,
            date: Date,
            excludeTitles: string[] = [],
        ): Event[] | null {
            const key = buildCacheKey(groupIds, duration, date, excludeTitles)
            return this.isCacheValid(key) ? this.cache.get(key)!.events : null
        },

        setCache(
            groupIds: string[],
            duration: Duration,
            date: Date,
            events: Event[],
            excludeTitles: string[] = [],
        ) {
            this.cache.set(buildCacheKey(groupIds, duration, date, excludeTitles), {
                events,
                fetchedAt: Date.now(),
            })
        },

        /**
         * `excludeTitles` is the student's hidden courses. Only their own
         * planning passes it: a room, a teacher or someone else's group is
         * shown whole.
         */
        async fetchEvents(
            groupIds: string[],
            duration: Duration,
            date: Date,
            excludeTitles: string[] = [],
        ): Promise<Event[]> {
            const cached = this.getCached(groupIds, duration, date, excludeTitles)
            if (cached) return cached

            this.loading = true
            try {
                let all: Event[]
                if (duration === Duration.WEEK) {
                    const monday = mondayOfWeek(date)
                    const res = await backend.api.events.week.$get({
                        query: { date: toIsoDateString(monday), ...excludeQuery(excludeTitles) },
                    })
                    const weekBody = await res.json()
                    all = (weekBody.data ?? []).map(enhanceEvent)
                } else {
                    const res = await backend.api.events.day.$get({
                        query: { date: toIsoDateString(date), ...excludeQuery(excludeTitles) },
                    })
                    const dayBody = await res.json()
                    all = (dayBody.data ?? []).map(enhanceEvent)
                }

                const filtered =
                    groupIds.length > 0
                        ? all.filter((e) => e.groups.some((g) => groupIds.includes(g.id)))
                        : all

                this.setCache(groupIds, duration, date, filtered, excludeTitles)
                return filtered
            } finally {
                this.loading = false
            }
        },

        async fetchWeekEvents(
            date: Date,
            groupIds: string[],
            excludeTitles: string[] = [],
        ): Promise<Event[]> {
            return this.fetchEvents(groupIds, Duration.WEEK, date, excludeTitles)
        },

        async fetchDayEvents(
            date: Date,
            groupIds: string[],
            excludeTitles: string[] = [],
        ): Promise<Event[]> {
            return this.fetchEvents(groupIds, Duration.DAY, date, excludeTitles)
        },

        /**
         * A teacher's events for the week `date` falls in, or `null` when the
         * teacher does not exist. `date` is wall-clock, like the bounds the api
         * compares with. Not cached: the callers guard against stale responses.
         */
        async fetchTeacherWeekEvents(teacherId: string, date: Date): Promise<Event[] | null> {
            const monday = mondayOfWeek(date)
            const nextMonday = new Date(monday.getTime())
            nextMonday.setUTCDate(nextMonday.getUTCDate() + 7)
            const res = await backend.api.teachers[':id'].events.$get({
                param: { id: teacherId },
                query: { from: monday.getTime(), to: nextMonday.getTime() },
            })
            const body = await res.json()
            return 'data' in body ? (body.data ?? []).map(enhanceEvent) : null
        },

        /**
         * Every event of some groups between two wall-clock bounds, merged and
         * de-duplicated. A course shared by two of the ids comes back once.
         *
         * Not cached: the assignment form asks for an arbitrary window, unlike
         * the day and week pages the cache is keyed for. `from` / `to` are
         * wall-clock labels like the timestamps they filter, so the caller
         * passes `wallClockDayStart()` and not `new Date()`.
         */
        async fetchRange(groupIds: string[], from: Date, to: Date): Promise<Event[]> {
            // The route coerces its bounds with `z.coerce.date()`, so the
            // generated client asks for a `Date`. Handing it one, though, lets
            // `String()` render the label in the browser's timezone and shift
            // the window by the Paris offset. The ISO text is what must travel.
            const asParam = (d: Date) => d.toISOString() as unknown as Date
            const window = { from: asParam(from), to: asParam(to) }
            // The api filters on one group at a time, and a class inherits its
            // ancestors' courses, so this is one request per id.
            const responses = await Promise.all(
                groupIds.length > 0
                    ? groupIds.map((groupId) =>
                          backend.api.events.$get({ query: { ...window, groupId } }),
                      )
                    : [backend.api.events.$get({ query: window })],
            )
            const byId = new Map<string, Event>()
            for (const res of responses) {
                const body = await res.json()
                for (const e of body.data ?? []) byId.set(e.id, enhanceEvent(e))
            }
            return [...byId.values()].sort((a, b) => a.start.getTime() - b.start.getTime())
        },

        /** One event, for a link that points outside the window being shown. */
        async fetchById(id: string): Promise<Event | null> {
            const res = await backend.api.events[':id'].$get({ param: { id }, query: {} })
            if (!res.ok) return null
            const body = await res.json()
            return 'id' in body ? enhanceEvent(body) : null
        },

        async fetchUpcoming(
            groupIds: string[],
            limit = 5,
            excludeTitles: string[] = [],
        ): Promise<Event[]> {
            // The api applies the limit after filtering, so this really is the
            // user's next `limit` events rather than everyone's.
            const res = await backend.api.events.upcoming.$get({
                query: {
                    limit,
                    ...(groupIds.length > 0 ? { groupIds: groupIds.join(',') } : {}),
                    ...excludeQuery(excludeTitles),
                },
            })
            const body = await res.json()
            return (body.data ?? []).map(enhanceEvent)
        },

        /**
         * The scraper's audit log for the given groups. Not cached: the point of
         * the page is to show what changed since the last look.
         */
        async fetchChanges(groupIds: string[], days = 14, limit?: number): Promise<EventChange[]> {
            const res = await backend.api.events.changes.$get({
                query: {
                    days,
                    ...(groupIds.length > 0 ? { groupIds: groupIds.join(',') } : {}),
                    ...(limit === undefined ? {} : { limit }),
                },
            })
            const body = await res.json()
            return (body.data ?? []).map(enhanceChange)
        },

        clearCache() {
            this.cache.clear()
        },
    },
})
