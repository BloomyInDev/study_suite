import type { Page } from 'playwright'

export async function gotoPlanning(page: Page, url: string): Promise<void> {
    await page.goto(url)
    await page.waitForSelector('div#Planning')
}

export async function getCurrentWeekId(page: Page): Promise<number> {
    return page.evaluate(() => {
        const buttons = document.querySelectorAll('.x-btn-pressed')
        const last = buttons[buttons.length - 1]
        const id = last?.getAttribute('id') ?? ''
        return parseInt(id.replace(/^x-auto-/, ''), 10)
    })
}

export async function gotoWeek(page: Page, weekId: number): Promise<void> {
    await page.click(`#x-auto-${weekId}`)
    await page.waitForSelector('.gwt-PopupPanel', { state: 'detached' })
}

export async function getAllWeekIds(page: Page): Promise<number[]> {
    return page.evaluate(() => {
        const container = document.querySelector('#x-auto-26')
        if (!container) throw new Error('#x-auto-26 not found')
        return Array.from(container.children)
            .map((el) => parseInt(el.id.replace(/^x-auto-/, ''), 10))
            .filter((n) => !isNaN(n))
    })
}
