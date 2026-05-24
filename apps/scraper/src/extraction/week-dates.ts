import type { Page } from 'playwright'

/** Returns 6 date strings in dd/mm/yyyy format, one per visible column. */
export async function readWeekDates(page: Page): Promise<string[]> {
    return page.evaluate(() => {
        return Array.from(document.querySelectorAll<HTMLElement>('div.labelLegend'))
            .filter((el) => el.style.top === '20px')
            .map((el) => el.textContent?.trim().split(/\s+/).at(-1) ?? '')
    })
}
