import { chromium } from 'playwright'
import type { Browser, Page } from 'playwright'

export async function launchBrowser(headless: boolean): Promise<{ browser: Browser; page: Page }> {
  const browser = await chromium.launch({ headless })
  const context = await browser.newContext({
    viewport: { width: 3840, height: 2160 },
  })
  const page = await context.newPage()
  return { browser, page }
}
