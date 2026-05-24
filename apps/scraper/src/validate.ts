import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { parseEventText } from './parser/event-text.js'

interface RawEvent {
    rawText: string
    left: number
    computedDayIndex: number
    date: string | null
}
interface Week {
    weekId: number
    weekDates: string[]
    columnWidth: number
    events: RawEvent[]
}
interface Dump {
    weeks: Week[]
}

const dumpPath = path.resolve(process.cwd(), 'dump.json')
const dump: Dump = JSON.parse(await readFile(dumpPath, 'utf-8'))

let total = 0
let parsed = 0
const failures: { rawText: string; dayIndex: number; weekDates: string[] }[] = []

for (const week of dump.weeks) {
    for (const ev of week.events) {
        total++
        const result = parseEventText(ev.rawText, ev.computedDayIndex, week.weekDates, new Set())
        if (result) {
            parsed++
        } else {
            failures.push({
                rawText: ev.rawText,
                dayIndex: ev.computedDayIndex,
                weekDates: week.weekDates,
            })
        }
    }
}

console.log(`\n=== Validation results ===`)
console.log(`Total:  ${total}`)
console.log(`Parsed: ${parsed} (${((parsed / total) * 100).toFixed(2)}%)`)
console.log(`Failed: ${failures.length}`)

if (failures.length > 0) {
    console.log(`\n--- First ${Math.min(10, failures.length)} failures ---`)
    for (const f of failures.slice(0, 10)) {
        console.log(`\ndayIndex=${f.dayIndex}  dates=${f.weekDates.slice(0, 3).join(', ')}`)
        console.log(f.rawText.replace(/ /g, '·').replace(/\n/g, ' | '))
    }
}
