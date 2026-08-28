import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { Page } from 'playwright'

/**
 * Screenshots the page a scrape died on. Never throws: a failed capture must
 * not mask the error that triggered it.
 */
export async function captureFailure(page: Page, debugDir: string): Promise<void> {
    try {
        await mkdir(debugDir, { recursive: true })
        const stamp = new Date().toISOString().replace(/[:.]/g, '-')
        const path = join(debugDir, `failure-${stamp}.png`)
        await page.screenshot({ path, fullPage: true })
        console.error(`[scraper] Wrote failure screenshot to ${path}`)
    } catch (err) {
        console.error('[scraper] Could not capture failure screenshot:', err)
    }
}
