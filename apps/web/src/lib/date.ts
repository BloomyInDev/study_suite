import type { Ref } from 'vue'
import { wallClockNow } from '@studysuite/shared/time'

// Event timestamps are Paris wall-clock labelled UTC, which is why everything
// below reads them through `timeZone: 'UTC'` and the UTC getters. A real
// instant has to be converted before it can be compared with one.
export {
    toWallClock,
    wallClockNow,
    wallClockDayStart,
    wallClockDayEnd,
} from '@studysuite/shared/time'

export const formatTime = (date: Date): string =>
    date.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'UTC',
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
        timeZone: 'UTC',
    })

export const formatTimeUntil = (
    target: Date,
    textBefore = 'dans',
    from: Date = wallClockNow(),
): string => {
    const diffMins = Math.round((target.getTime() - from.getTime()) / 60000)
    if (diffMins < 0) return 'déjà commencé'

    const isSameDay =
        target.toLocaleDateString('fr-FR', { timeZone: 'UTC' }) ===
        from.toLocaleDateString('fr-FR', { timeZone: 'UTC' })

    if (isSameDay) {
        if (diffMins < 60) return `${textBefore} ${diffMins} minute${diffMins > 1 ? 's' : ''}`
        const h = Math.floor(diffMins / 60)
        const m = diffMins % 60
        return `${textBefore} ${h}h${m > 0 ? m.toString().padStart(2, '0') : ''}`
    }

    const tomorrow = new Date(from)
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
    if (
        target.toLocaleDateString('fr-FR', { timeZone: 'UTC' }) ===
        tomorrow.toLocaleDateString('fr-FR', { timeZone: 'UTC' })
    )
        return `demain à ${formatTime(target)}`

    return target
        .toLocaleDateString('fr-FR', {
            weekday: 'long',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'UTC',
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

export const toCalendarLocalDate = (date: Date): Date => {
    const d = new Date(date)
    d.setMinutes(d.getMinutes() + d.getTimezoneOffset())
    return d
}

export const dateAtMidnight = (date: Date): Date => {
    const d = new Date(date.getTime())
    d.setUTCHours(0, 0, 0, 0)
    return d
}

export const mondayOfWeek = (date: Date): Date => {
    const d = new Date(date.getTime())
    const day = d.getUTCDay() || 7
    if (day !== 1) d.setUTCHours(-24 * (day - 1))
    return dateAtMidnight(d)
}

export const toIsoDateString = (date: Date): string => {
    const y = date.getUTCFullYear()
    const m = String(date.getUTCMonth() + 1).padStart(2, '0')
    const d = String(date.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
}

export const weekdayFormat = (timestamp: { date: string }): string =>
    new Date(timestamp.date).toLocaleDateString('fr-FR', { weekday: 'long', timeZone: 'UTC' })

// The paged date is wall-clock, like everything else here, so the arithmetic and
// the Sunday skip read the UTC getters — the local ones would land on the next
// day (and skip the wrong Sunday) for any wall-clock hour past 22h.
export const nextDay = (date: Ref<Date>, increment: number): void => {
    const d = new Date(date.value)
    d.setUTCDate(d.getUTCDate() + increment)
    if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1)
    date.value = d
}

export const previousDay = (date: Ref<Date>, decrement: number): void => {
    const d = new Date(date.value)
    d.setUTCDate(d.getUTCDate() - decrement)
    if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() - 1)
    date.value = d
}
