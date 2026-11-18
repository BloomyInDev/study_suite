import { backend } from './api.js'
import { addParisDays, parisDayStart } from './date.js'

/** How far either side of today a title counts: the current semester, with margin. */
const WINDOW_DAYS = 120

/**
 * The course titles a student may pick from: those of their groups' courses
 * around today, ancestors included by the api. Not every title the database
 * has ever held, which spans every class and every past year. With no group
 * picked, every group's titles in that window.
 */
export async function fetchCourseTitles(groupIds: readonly string[]): Promise<string[]> {
    const today = parisDayStart()
    const res = await backend.api.events.titles.$get({
        query: {
            from: addParisDays(today, -WINDOW_DAYS).toISOString(),
            to: addParisDays(today, WINDOW_DAYS).toISOString(),
            ...(groupIds.length > 0 ? { groupIds: groupIds.join(',') } : {}),
        },
    })
    return res.ok ? (await res.json()).data : []
}
