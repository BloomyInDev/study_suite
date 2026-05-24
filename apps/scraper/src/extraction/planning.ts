import type { Page } from 'playwright'

export interface RawEvent {
    rawText: string
    left: number
}

export async function extractRawEvents(page: Page): Promise<RawEvent[]> {
    return page.$$eval('#Planning > div', (els) =>
        els.flatMap((el) => {
            const wrapper = el as HTMLElement
            const left = parseInt(wrapper.style.left, 10)
            const textEl = wrapper.querySelector<HTMLElement>('.eventText')
            const rawText = (textEl ?? wrapper).innerText.trim()
            return rawText ? [{ rawText, left }] : []
        }),
    )
}
