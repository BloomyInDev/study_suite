import type { Page } from 'playwright'

export interface RawEvent {
  rawText: string
  left: number
}

export async function extractRawEvents(page: Page): Promise<RawEvent[]> {
  return page.$$eval('#Planning > div', els =>
    els.map(el => ({
      rawText: (el as HTMLElement).innerText,
      left: parseInt((el as HTMLElement).style.left, 10),
    })),
  )
}
