import { chromium } from 'playwright'
import type { Browser, Page } from 'playwright'

export async function launchBrowser(
    headless: boolean,
    timeoutMs: number,
): Promise<{ browser: Browser; page: Page }> {
    const browser = await chromium.launch({ headless })
    const context = await browser.newContext({
        viewport: { width: 3840, height: 2160 },
    })
    const page = await context.newPage()
    // Prose Consult can be slow to render #Planning; Playwright's own default
    // is 30s, which is not always enough.
    page.setDefaultTimeout(timeoutMs)
    page.setDefaultNavigationTimeout(timeoutMs)
    return { browser, page }
}
