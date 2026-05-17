import type { ParsedEvent } from '@studysuite/shared'
import { parseHours } from './hours.js'
import { categorizeLines } from './lines.js'

export function parseEventText(
  rawText: string,
  dayIndex: number,
  weekDates: string[],
  knownGroupNames: Set<string>,
): ParsedEvent | null {
  const lines = rawText
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)

  if (lines.length < 2) return null

  const title = lines[0]
  const hoursRaw = lines[lines.length - 1]
  const middleLines = lines.slice(1, lines.length - 1)

  const dayDate = weekDates[dayIndex]
  if (!dayDate) return null

  const { start, end } = parseHours(hoursRaw, dayDate)
  const { rooms, teachers, groups } = categorizeLines(middleLines, knownGroupNames)

  return { title, startDate: start, endDate: end, rooms, teachers, groups }
}
