import { formatFullDate, formatTime } from './date.js'
import type { ChangeRelations, ChangeType, EventChange } from './types.js'

export const CHANGE_TYPES: Record<ChangeType, { label: string; color: string; icon: string }> = {
    added: { label: 'Ajouté', color: 'success', icon: 'mdi-plus-circle-outline' },
    removed: { label: 'Supprimé', color: 'error', icon: 'mdi-minus-circle-outline' },
    moved: { label: 'Déplacé', color: 'warning', icon: 'mdi-calendar-arrow-right' },
    updated: { label: 'Modifié', color: 'info', icon: 'mdi-pencil-outline' },
}

export const changeTypeItems = (Object.keys(CHANGE_TYPES) as ChangeType[]).map((value) => ({
    value,
    title: CHANGE_TYPES[value].label,
}))

/** `detectedAt` is a real instant, so it is the local clock that formats it. */
export const formatDetected = (iso: string): string =>
    new Date(iso).toLocaleString('fr-FR', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
    })

/** The slot an event held, as one line — wall-clock, hence the UTC formatters. */
export const formatSlot = (start: Date, end: Date): string =>
    `${formatFullDate(start)} – ${formatTime(end)}`

const teacherNames = (rel: ChangeRelations): string[] =>
    rel.teachers.map((t) => `${t.firstName} ${t.lastName}`)

/** The three relation lists, kept only where the two sides actually differ. */
export function relationDiff(change: EventChange): {
    label: string
    before: string
    after: string
}[] {
    if (!change.diff) return []
    const rows: { label: string; before: string; after: string }[] = []
    const push = (label: string, before: string[], after: string[]) => {
        const b = before.join(', ') || '—'
        const a = after.join(', ') || '—'
        if (b !== a) rows.push({ label, before: b, after: a })
    }
    push('Salles', change.diff.before.rooms, change.diff.after.rooms)
    push('Enseignants', teacherNames(change.diff.before), teacherNames(change.diff.after))
    push('Groupes', change.diff.before.groups, change.diff.after.groups)
    return rows
}

/** Groups a flat log into one bucket per scraper run, which is how it reads. */
export function groupByRun(changes: EventChange[]): {
    detectedAt: string
    items: EventChange[]
}[] {
    const byRun = new Map<string, EventChange[]>()
    for (const change of changes) {
        byRun.set(change.detectedAt, [...(byRun.get(change.detectedAt) ?? []), change])
    }
    return [...byRun.entries()].map(([detectedAt, items]) => ({ detectedAt, items }))
}
