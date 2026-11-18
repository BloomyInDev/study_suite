import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    attachBot,
    botConnected,
    deliverToBot,
    type BotConnection,
    type DiscordReminderMessage,
} from './discord-reminder-hub.js'

const message: DiscordReminderMessage = {
    discordUserId: '812340987654321098',
    eventId: null,
    title: 'Test',
    body: 'Maintenant',
    startsAt: null,
}

function connection(send: BotConnection['send'] = async () => {}) {
    return { send: vi.fn(send), close: vi.fn() }
}

let detachers: (() => void)[] = []
const attach = (c: BotConnection) => {
    const detach = attachBot(c)
    detachers.push(detach)
    return detach
}

afterEach(() => {
    detachers.forEach((d) => d())
    detachers = []
})

describe('the Discord reminder hub', () => {
    it('delivers nothing while no bot is connected', async () => {
        expect(botConnected()).toBe(false)
        expect(await deliverToBot(message)).toBe(false)
    })

    it('hands a message to the connected bot', async () => {
        const bot = connection()
        attach(bot)
        expect(await deliverToBot(message)).toBe(true)
        expect(bot.send).toHaveBeenCalledWith(message)
    })

    it('lets the newest connection take over and closes the previous one', async () => {
        const old = connection()
        const detachOld = attach(old)
        const fresh = connection()
        attach(fresh)

        expect(old.close).toHaveBeenCalledOnce()
        await deliverToBot(message)
        expect(fresh.send).toHaveBeenCalledOnce()
        expect(old.send).not.toHaveBeenCalled()

        // The old stream ending late must not unplug the new one.
        detachOld()
        expect(botConnected()).toBe(true)
    })

    it('forgets a connection once it ends', () => {
        const detach = attach(connection())
        detach()
        expect(botConnected()).toBe(false)
    })

    it('reports a failed write without throwing', async () => {
        attach(
            connection(async () => {
                throw new Error('socket closed')
            }),
        )
        expect(await deliverToBot(message)).toBe(false)
    })
})
