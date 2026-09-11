import { describe, expect, it } from 'vitest'
import { isSnowflake, matchesBotKey } from './bot-key.js'

const key = 'k'.repeat(40)
const other = 'o'.repeat(40)

describe('matchesBotKey', () => {
    it('accepts any configured key', () => {
        expect(matchesBotKey(`Bot ${key}`, [key, other])).toBe(true)
        expect(matchesBotKey(`Bot ${other}`, [key, other])).toBe(true)
    })

    it('rejects another key, even a prefix of one', () => {
        expect(matchesBotKey(`Bot ${key.slice(0, 39)}`, [key])).toBe(false)
        expect(matchesBotKey(`Bot ${key}x`, [key])).toBe(false)
    })

    // Revoking a bot is removing its key: the others must keep working alone.
    it('stops accepting a removed key', () => {
        expect(matchesBotKey(`Bot ${key}`, [other])).toBe(false)
    })

    // A user JWT must never be mistaken for a bot, whatever it contains.
    it('only reads the Bot scheme', () => {
        expect(matchesBotKey(`Bearer ${key}`, [key])).toBe(false)
        expect(matchesBotKey(key, [key])).toBe(false)
    })

    // With no key configured, an empty `Bot ` header must not match an empty key.
    it('refuses everything when no key is configured', () => {
        expect(matchesBotKey('Bot ', undefined)).toBe(false)
        expect(matchesBotKey('Bot ', [])).toBe(false)
        expect(matchesBotKey('Bot ', [''])).toBe(false)
    })
})

describe('isSnowflake', () => {
    it('accepts Discord ids', () => {
        expect(isSnowflake('705623509884796939')).toBe(true)
    })

    it('rejects anything else', () => {
        expect(isSnowflake(undefined)).toBe(false)
        expect(isSnowflake('')).toBe(false)
        expect(isSnowflake('123')).toBe(false)
        expect(isSnowflake('70562350988479693a')).toBe(false)
    })
})
