import type { Page } from 'playwright'

/** Returns 6 date strings in dd/mm/yyyy format, one per visible column. */
export async function readWeekDates(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll('div.labelLegend'))
      .map(el => el.textContent?.trim() ?? '')
      .slice(1, 7)
      .map(t => t.split(' ').at(-1) ?? '')
  })
}
