import type { ParsedEvent } from '@studysuite/shared'
import { parseHours } from './hours.js'
import { categorizeLines } from './lines.js'

export function parseEventText(
    rawText: string,
    dayIndex: number,
    weekDates: string[],
    knownGroupNames: Set<string>,
    strictGroups = false,
): ParsedEvent | null {
    const lines = rawText
        .replace(/ /g, ' ')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0)

    if (lines.length < 3) return null

    const dayDate = weekDates[dayIndex]
    if (!dayDate) return null

    const title = lines[0]!
    const hoursRaw = lines[lines.length - 1]!
    const middleLines = lines.slice(1, -1)

    const hours = parseHours(hoursRaw, dayDate)
    if (!hours) {
        console.warn(`[parser] invalid hours "${hoursRaw}" for "${title}"`)
        return null
    }

    const { rooms, teachers, groups } = categorizeLines(middleLines, knownGroupNames, strictGroups)

    return { title, startDate: hours.start, endDate: hours.end, rooms, teachers, groups }
}
