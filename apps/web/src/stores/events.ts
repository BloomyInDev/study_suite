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

const buildCacheKey = (groupIds: string[], duration: Duration, date: Date): string => {
    const gKey = [...groupIds].sort().join(',')
    const dKey = duration === Duration.WEEK ? toUtcDateKey(mondayOfWeek(date)) : toUtcDateKey(date)
    return `${gKey}-${duration}-${dKey}`
}

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

        getCached(groupIds: string[], duration: Duration, date: Date): Event[] | null {
            const key = buildCacheKey(groupIds, duration, date)
            return this.isCacheValid(key) ? this.cache.get(key)!.events : null
        },

        setCache(groupIds: string[], duration: Duration, date: Date, events: Event[]) {
            this.cache.set(buildCacheKey(groupIds, duration, date), {
                events,
                fetchedAt: Date.now(),
            })
        },

        async fetchEvents(groupIds: string[], duration: Duration, date: Date): Promise<Event[]> {
            const cached = this.getCached(groupIds, duration, date)
            if (cached) return cached

            this.loading = true
            try {
                let all: Event[]
                if (duration === Duration.WEEK) {
                    const monday = mondayOfWeek(date)
                    const res = await backend.api.events.week.$get({
                        query: { date: toIsoDateString(monday) },
                    })
                    const weekBody = await res.json()
                    all = (weekBody.data ?? []).map(enhanceEvent)
                } else {
                    const res = await backend.api.events.day.$get({
                        query: { date: toIsoDateString(date) },
                    })
                    const dayBody = await res.json()
                    all = (dayBody.data ?? []).map(enhanceEvent)
                }

                const filtered =
                    groupIds.length > 0
                        ? all.filter((e) => e.groups.some((g) => groupIds.includes(g.id)))
                        : all

                this.setCache(groupIds, duration, date, filtered)
                return filtered
            } finally {
                this.loading = false
            }
        },

        async fetchWeekEvents(date: Date, groupIds: string[]): Promise<Event[]> {
            return this.fetchEvents(groupIds, Duration.WEEK, date)
        },

        async fetchDayEvents(date: Date, groupIds: string[]): Promise<Event[]> {
            return this.fetchEvents(groupIds, Duration.DAY, date)
        },

        async fetchUpcoming(groupIds: string[], limit = 5): Promise<Event[]> {
            // The api applies the limit after filtering, so this really is the
            // user's next `limit` events rather than everyone's.
            const res = await backend.api.events.upcoming.$get({
                query: groupIds.length > 0 ? { limit, groupIds: groupIds.join(',') } : { limit },
            })
            const body = await res.json()
            return (body.data ?? []).map(enhanceEvent)
        },

        /**
         * The scraper's audit log for the given groups. Not cached: the point of
         * the page is to show what changed since the last look.
         */
        async fetchChanges(groupIds: string[], days = 14): Promise<EventChange[]> {
            const res = await backend.api.events.changes.$get({
                query: groupIds.length > 0 ? { days, groupIds: groupIds.join(',') } : { days },
            })
            const body = await res.json()
            return (body.data ?? []).map(enhanceChange)
        },

        clearCache() {
            this.cache.clear()
        },
    },
})
