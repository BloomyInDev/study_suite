export interface Config {
  proseconsultUrl: string
  databaseUrl: string
  headless: boolean
  intervalMs: number
  runOnce: boolean
}

export function loadConfig(): Config {
  const proseconsultUrl = process.env.PROSECONSULT_URL
  if (!proseconsultUrl) throw new Error('PROSECONSULT_URL is required')

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL is required')

  return {
    proseconsultUrl,
    databaseUrl,
    headless: process.env.HEADLESS !== 'false',
    intervalMs: parseInt(process.env.SCRAPE_INTERVAL_MS ?? '1800000', 10),
    runOnce: process.argv.includes('--once'),
  }
}
