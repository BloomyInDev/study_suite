import { parisDate, parisParts } from '@studysuite/shared/time'
import type { Event } from './types.js'

/**
 * How far each course of the semester has gone, counted on the published
 * planning. Kept simple on purpose: courses are grouped by their exact title,
 * and the threshold plus one word filter is all the cleaning there is.
 *
 * A course split per group ("Droit … -A"), a one-off meeting or a sprint
 * delivery has a single session and never reaches the threshold. Tests, exams
 * and make-ups come in twos and threes, hence the filter. Measured on prod in
 * November 2026: 15 to 18 bars per class, plus the short real series (a
 * three-session "Git avancé", an SAE kick-off) that a threshold of 5 dropped.
 */
export const MIN_SESSIONS = 2
const NOT_A_COURSE = /test|examen|rattrapage|interro/i

/** The semester `now` falls in, Paris time: 1 September to 1 February, or 1 February to 1 September. */
export function semesterWindow(now: Date): { from: Date; to: Date } {
    const { year, month } = parisParts(now)
    if (month >= 9) return { from: parisDate(year, 9, 1), to: parisDate(year + 1, 2, 1) }
    if (month === 1) return { from: parisDate(year - 1, 9, 1), to: parisDate(year, 2, 1) }
    return { from: parisDate(year, 2, 1), to: parisDate(year, 9, 1) }
}

export interface CourseProgress {
    title: string
    /** Sessions that have started. */
    done: number
    total: number
}

/** Courses in progress first, then those not started, then the finished ones. */
function stage(p: CourseProgress): number {
    if (p.done >= p.total) return 2
    return p.done > 0 ? 0 : 1
}

export function courseProgress(
    events: Event[],
    now: Date,
    hiddenTitles: string[] = [],
): CourseProgress[] {
    const byTitle = new Map<string, CourseProgress>()
    for (const e of events) {
        if (hiddenTitles.includes(e.title) || NOT_A_COURSE.test(e.title)) continue
        const p = byTitle.get(e.title) ?? { title: e.title, done: 0, total: 0 }
        p.total++
        if (e.start <= now) p.done++
        byTitle.set(e.title, p)
    }
    return [...byTitle.values()]
        .filter((p) => p.total >= MIN_SESSIONS)
        .sort((a, b) => stage(a) - stage(b) || a.title.localeCompare(b.title, 'fr'))
}
