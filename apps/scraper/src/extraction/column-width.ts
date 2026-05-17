import type { Page } from 'playwright'

export async function computeColumnWidth(page: Page): Promise<number> {
  return page.evaluate(() => {
    const table = document.querySelector(
      'div.x-panel-body > div#x-auto-98 :nth-child(2) > table',
    )
    if (!table) throw new Error('Header table not found')

    // Skip the first cell, iterate remaining until a text repeats.
    // The left distance between the repeated cell and the first processed cell = column width.
    const cells = Array.from(table.querySelectorAll('td')).slice(1)
    const seen = new Map<string, number>()
    let firstLeft: number | null = null

    for (const cell of cells) {
      const text = cell.textContent?.trim() ?? ''
      const left = cell.getBoundingClientRect().left

      if (firstLeft === null) {
        firstLeft = left
        seen.set(text, left)
        continue
      }

      if (text !== '' && seen.has(text)) {
        return left - firstLeft
      }

      seen.set(text, left)
    }

    throw new Error('Could not compute column width: no repeated header element found')
  })
}
