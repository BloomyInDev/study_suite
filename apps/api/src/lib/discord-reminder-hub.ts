/**
 * The open SSE connection to the Discord bot, through which the tick hands it
 * the DMs to send.
 *
 * One bot delivers at a time. Several connected bots would each DM the same
 * member, so the newest connection takes over and the previous one is closed:
 * that is also what a bot reconnecting after a network blip looks like, its
 * old socket not yet noticed as dead.
 *
 * Free of the database and of Hono, so it can be tested on plain functions.
 */

/** What the bot turns into one DM. The text is ready to send as is. */
export interface DiscordReminderMessage {
    discordUserId: string
    /** The course, or null for a test sent from the settings panel. */
    eventId: string | null
    title: string
    body: string
    /** ISO 8601 instant, for a Discord timestamp. Null for a test. */
    startsAt: string | null
}

export interface BotConnection {
    send(message: DiscordReminderMessage): Promise<void>
    close(): void
}

let current: BotConnection | null = null

/**
 * Makes `connection` the one that delivers, closing the previous one. Returns
 * the function to call when this connection ends; it does nothing once a
 * newer one has taken over.
 */
export function attachBot(connection: BotConnection): () => void {
    const previous = current
    current = connection
    previous?.close()
    return () => {
        if (current === connection) current = null
    }
}

export function botConnected(): boolean {
    return current !== null
}

/**
 * Hands `message` to the connected bot. False when none is connected or the
 * write failed; the message is not queued, since a reminder is only worth
 * sending before its course.
 */
export async function deliverToBot(message: DiscordReminderMessage): Promise<boolean> {
    const connection = current
    if (!connection) return false
    try {
        await connection.send(message)
        return true
    } catch {
        return false
    }
}
