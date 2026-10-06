import type { Ref } from 'vue'
import {
    PLANNING_TZ,
    addParisDays,
    parisDayKey,
    parisParts,
    parisWeekStart,
} from '@studysuite/shared/time'

export {
    addParisDays,
    parisDayEnd,
    parisDayStart,
    parisParts,
    parisWeekStart,
} from '@studysuite/shared/time'

export const formatTime = (date: Date): string =>
    date.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: PLANNING_TZ,
    })

/** `lun. 15 sept.` */
export const formatShortDay = (date: Date): string =>
    date.toLocaleDateString('fr-FR', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        timeZone: PLANNING_TZ,
    })

export const formatFullDate = (date: Date): string =>
    date.toLocaleString('fr-FR', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: PLANNING_TZ,
    })

export const formatTimeUntil = (
    target: Date,
    textBefore = 'dans',
    from: Date = new Date(),
): string => {
    const diffMins = Math.round((target.getTime() - from.getTime()) / 60000)
    if (diffMins < 0) return 'déjà commencé'

    if (parisDayKey(target) === parisDayKey(from)) {
        if (diffMins < 60) return `${textBefore} ${diffMins} minute${diffMins > 1 ? 's' : ''}`
        const h = Math.floor(diffMins / 60)
        const m = diffMins % 60
        return `${textBefore} ${h}h${m > 0 ? m.toString().padStart(2, '0') : ''}`
    }

    if (parisDayKey(target) === parisDayKey(addParisDays(from, 1)))
        return `demain à ${formatTime(target)}`

    return target
        .toLocaleDateString('fr-FR', {
            weekday: 'long',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: PLANNING_TZ,
        })
        .replace(',', ' à')
}

export const formatDueRelative = (iso: string, from: Date = new Date()): string => {
    const target = new Date(iso)
    const diffMs = target.getTime() - from.getTime()
    const diffMins = Math.round(diffMs / 60000)

    if (diffMins < -60 * 24) {
        const days = Math.round(-diffMins / (60 * 24))
        return `il y a ${days} jour${days > 1 ? 's' : ''}`
    }
    if (diffMins < 0) return 'passé'
    if (diffMins < 60) return `dans ${diffMins} min`
    if (diffMins < 60 * 24) {
        const h = Math.floor(diffMins / 60)
        const m = diffMins % 60
        return `dans ${h}h${m > 0 ? m.toString().padStart(2, '0') : ''}`
    }
    const days = Math.floor(diffMins / (60 * 24))
    if (days === 1) return 'demain'
    return `dans ${days} jours`
}

/**
 * `v-calendar` places everything with the browser's *local* getters and offers
 * no way to name a zone. This hands it a date whose local reading is the Paris
 * one, so the grid shows Paris hours wherever the browser is. In Paris itself
 * it changes nothing. The result is for the calendar only: it is not the
 * instant any more, and must not be compared with one.
 */
export const toCalendarLocalDate = (date: Date): Date => {
    const { year, month, day, hour, minute, second } = parisParts(date)
    // eslint-disable-next-line no-restricted-syntax -- the one place a local reading is wanted
    return new Date(year, month - 1, day, hour, minute, second)
}

export const mondayOfWeek = (date: Date): Date => parisWeekStart(date)

export const toIsoDateString = (date: Date): string => parisDayKey(date)

// `timestamp.date` is the calendar's own `YYYY-MM-DD`, a day with no zone, so
// it is parsed and read back in UTC to stay that day everywhere.
export const weekdayFormat = (timestamp: { date: string }): string =>
    new Date(timestamp.date).toLocaleDateString('fr-FR', { weekday: 'long', timeZone: 'UTC' })

const isParisSunday = (date: Date): boolean => parisParts(date).weekday === 0

export const nextDay = (date: Ref<Date>, increment: number): void => {
    const d = addParisDays(date.value, increment)
    date.value = isParisSunday(d) ? addParisDays(d, 1) : d
}

export const previousDay = (date: Ref<Date>, decrement: number): void => {
    const d = addParisDays(date.value, -decrement)
    date.value = isParisSunday(d) ? addParisDays(d, -1) : d
}

/**
 * Sunday is not one of the calendar's `weekdays`, and Vuetify walks from a
 * timestamp it cannot show in both directions: `getStartOfWeek` steps *back* to
 * the previous Monday while `getEndOfWeek` steps *forward* to the next
 * Saturday, then fills `maxDays: 7` from that start. Handed a Sunday, the week
 * view therefore renders Mon–Sat of the week that just ended plus the coming
 * Monday. `mondayOfWeek` reads a Sunday as the ended week too, so the fetch and
 * the grid would disagree on top of that.
 *
 * Snap onto the Monday that follows: on a Sunday the week worth showing is the
 * one about to start. `nextDay` / `previousDay` already skip Sunday, so this is
 * only needed where a date enters from outside: "Aujourd'hui" and mount.
 */
export const skipSunday = (date: Date): Date => (isParisSunday(date) ? addParisDays(date, 1) : date)
