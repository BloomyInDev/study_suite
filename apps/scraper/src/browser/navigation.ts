import type { Page } from 'playwright'
import { isWeekHeaderReady } from '../extraction/week-dates.js'

/**
 * How long the page has to hold still before a week counts as rendered.
 *
 * An empty week and a week still rendering are the same DOM: the Christmas
 * weeks settle with no `#Planning > div` at all, exactly like a week whose
 * events have not been appended yet. Nothing about the shape separates them,
 * so the spinner being gone and the count holding still is the whole signal.
 */
const SETTLE_QUIET_MS = 600

/** How long to wait for a week to render at all before giving up on it. */
const SETTLE_TIMEOUT_MS = 20_000

const POLL_MS = 100

/** A week that never rendered. Thrown so the caller skips it instead of reading it. */
export class WeekNavigationError extends Error {
    constructor(weekId: number, reason: string) {
        super(`Week id ${weekId} did not render: ${reason}`)
        this.name = 'WeekNavigationError'
    }
}

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

interface WeekState {
    /** Whether the week button carries `x-btn-pressed`, i.e. the click registered. */
    selected: boolean
    /** Whether the loading spinner is up. */
    loading: boolean
    /** `#Planning > div` count: event wrappers, before any text filtering. */
    wrappers: number
    dates: string[]
}

function readWeekState(page: Page, weekId: number): Promise<WeekState> {
    return page.evaluate((id) => {
        return {
            selected:
                document.getElementById(`x-auto-${id}`)?.classList.contains('x-btn-pressed') ??
                false,
            loading: !!document.querySelector('.gwt-PopupPanel'),
            wrappers: document.querySelectorAll('#Planning > div').length,
            dates: Array.from(document.querySelectorAll<HTMLElement>('div.labelLegend'))
                .filter((el) => el.style.top === '20px')
                .map((el) => el.textContent?.trim().split(/\s+/).at(-1) ?? ''),
        }
    }, weekId)
}

/**
 * Waits until the page is showing the week that was clicked, fully rendered.
 *
 * The pressed class and the day headers both flip within ~50ms of the click,
 * long before the events land, so neither is evidence on its own. What is:
 * the spinner gone and `#Planning > div` unchanged for `SETTLE_QUIET_MS`.
 */
async function waitForWeekRender(page: Page, weekId: number): Promise<string[]> {
    const deadline = Date.now() + SETTLE_TIMEOUT_MS
    let lastWrappers = -1
    let stableSince = Date.now()
    let reason = 'timed out before it settled'

    while (Date.now() < deadline) {
        const state = await readWeekState(page, weekId)

        // A click landing while the app is busy is dropped silently, leaving
        // the previous week on screen, hence checking the button and not just
        // the headers, which the previous week also satisfies.
        if (!state.selected) reason = 'the week button never became the selected one'
        else if (state.loading) reason = 'the loading spinner never went away'
        else if (!isWeekHeaderReady(state.dates))
            reason = `day headers read ${JSON.stringify(state.dates)}`

        const ready = state.selected && !state.loading && isWeekHeaderReady(state.dates)

        if (ready && state.wrappers === lastWrappers) {
            if (Date.now() - stableSince >= SETTLE_QUIET_MS) return state.dates
        } else {
            lastWrappers = state.wrappers
            stableSince = Date.now()
        }

        await page.waitForTimeout(POLL_MS)
    }

    throw new WeekNavigationError(weekId, reason)
}

/**
 * Clicks a week and hands back its day headers once the page is actually
 * showing it. Throws rather than returning a stale or half-rendered DOM, which
 * reads as a week with no courses and deletes every event in it.
 */
export async function gotoWeek(page: Page, weekId: number): Promise<string[]> {
    await page.click(`#x-auto-${weekId}`)
    return waitForWeekRender(page, weekId)
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
