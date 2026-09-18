import type { Page } from 'playwright'

/** `dd/mm/yyyy`, the shape every day header ends with. */
const DAY_DATE = /^\d{2}\/\d{2}\/\d{4}$/

/**
 * The planning shows Monday to Saturday. Anything shorter is a header the page
 * has not finished rendering, not a shorter week.
 */
const MIN_DAY_COLUMNS = 5

/** Returns 6 date strings in dd/mm/yyyy format, one per visible column. */
export async function readWeekDates(page: Page): Promise<string[]> {
    return page.evaluate(() => {
        return Array.from(document.querySelectorAll<HTMLElement>('div.labelLegend'))
            .filter((el) => el.style.top === '20px')
            .map((el) => el.textContent?.trim().split(/\s+/).at(-1) ?? '')
    })
}

/**
 * Whether the header is complete enough to trust the columns under it. A
 * half-rendered header is the difference between reading a week and reading
 * nothing, and reading nothing used to delete the week.
 */
export function isWeekHeaderReady(dates: string[]): boolean {
    return dates.length >= MIN_DAY_COLUMNS && dates.every((d) => DAY_DATE.test(d))
}
