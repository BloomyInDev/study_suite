export function weekMondayUTC(date: Date): Date {
    const d = new Date(date)
    const day = d.getUTCDay() // 0=Sun, 1=Mon, …, 6=Sat
    const diff = day === 0 ? -6 : 1 - day
    d.setUTCDate(d.getUTCDate() + diff)
    d.setUTCHours(0, 0, 0, 0)
    return d
}

export function dayStartUTC(date: Date): Date {
    const d = new Date(date)
    d.setUTCHours(0, 0, 0, 0)
    return d
}

export function dayEndUTC(date: Date): Date {
    const d = dayStartUTC(date)
    d.setUTCDate(d.getUTCDate() + 1)
    return d
}
