import type { ParsedEvent, StudentGroup } from '@studysuite/shared'
import type { AdeEvent } from '../ade/events.js'

export interface BatchEvents {
    /** The department the batch's resources belong to, `null` when unknown. */
    department: string | null
    events: AdeEvent[]
}

/**
 * The internal name a group gets when it is only seen through another
 * department than the home one. The suffix is what keeps GEII's `S1` from
 * becoming Informatique's `S1`: `student_groups.internal_name` is unique.
 */
export const qualifiedName = (name: string, department: string) => `${name} (${department})`

/**
 * Folds every batch's events into one list, and names their groups.
 *
 * An event seen by several batches (a lecture shared by two departments, or a
 * department split over two batches) is one event, by ADE id and start. Its
 * groups are the union of what each batch printed, which is the same lines.
 *
 * The naming has to be the same on every run, whatever else the run saw, or
 * the groups flip between names and `event_changes` fills with moves. So it
 * depends on the event alone:
 *
 * - seen by a home batch: every group keeps its bare name. That is everything
 *   the deployment scraped before it covered other departments, unchanged.
 * - otherwise: each group is qualified with the department of the event,
 *   the first in alphabetical order when there are several, and keeps its
 *   bare name for display.
 */
export function mergeBatches(batches: readonly BatchEvents[], home: string | null): ParsedEvent[] {
    const merged = new Map<string, { event: AdeEvent; departments: Set<string | null> }>()
    for (const { department, events } of batches) {
        for (const event of events) {
            const key = `${event.adeId}|${event.startDate.getTime()}`
            const found = merged.get(key)
            if (found) {
                found.departments.add(department)
                const names = new Set(found.event.groups.map((g) => g.internalName))
                const extra = event.groups.filter((g) => !names.has(g.internalName))
                if (extra.length) {
                    found.event = { ...found.event, groups: [...found.event.groups, ...extra] }
                }
            } else {
                merged.set(key, { event, departments: new Set([department]) })
            }
        }
    }

    return [...merged.values()].map(({ event, departments }) => {
        const parsed: ParsedEvent & { adeId?: number } = { ...event }
        delete parsed.adeId
        if (departments.has(home)) return parsed
        const department = [...departments]
            .filter((d): d is string => d !== null)
            .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))[0]
        if (department === undefined) return parsed
        const groups: StudentGroup[] = parsed.groups.map((g) => ({
            internalName: qualifiedName(g.internalName, department),
            displayName: g.internalName,
        }))
        return { ...parsed, groups }
    })
}
