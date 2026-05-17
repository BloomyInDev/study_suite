export function parseHours(
  raw: string,
  dayDdMmYyyy: string,
): { start: Date; end: Date } {
  const trimmed = raw.trim()
  const dashIdx = trimmed.indexOf('-')
  const startRaw = trimmed.slice(0, dashIdx).trim()
  const endRaw = trimmed.slice(dashIdx + 1).trim()

  const [dayStr, monthStr, yearStr] = dayDdMmYyyy.split('/')
  const day = parseInt(dayStr, 10)
  const month = parseInt(monthStr, 10) - 1
  const year = parseInt(yearStr, 10)

  function parseTime(s: string): { h: number; m: number } {
    const hIdx = s.indexOf('h')
    const h = parseInt(s.slice(0, hIdx), 10)
    const mStr = s.slice(hIdx + 1).trim()
    const m = mStr.length > 0 ? parseInt(mStr, 10) : 0
    return { h, m: isNaN(m) ? 0 : m }
  }

  const { h: sh, m: sm } = parseTime(startRaw)
  const { h: eh, m: em } = parseTime(endRaw)

  return {
    start: new Date(Date.UTC(year, month, day, sh, sm, 0)),
    end: new Date(Date.UTC(year, month, day, eh, em, 0)),
  }
}
