import type { Page } from 'playwright'

export async function computeColumnWidth(page: Page): Promise<number> {
    return page.evaluate(() => {
        const lefts = Array.from(document.querySelectorAll<HTMLElement>('div.labelLegend'))
            .filter((el) => el.style.top === '20px')
            .map((el) => parseInt(el.style.left, 10))
            .sort((a, b) => a - b)

        if (lefts.length < 2)
            throw new Error('Could not compute column width: fewer than 2 day headers found')
        return lefts[1]! - lefts[0]!
    })
}
