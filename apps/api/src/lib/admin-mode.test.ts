import { describe, expect, it } from 'vitest'
import { actsAsAdmin } from './admin-mode.js'

describe('actsAsAdmin', () => {
    it('needs both the flag and the header', () => {
        expect(actsAsAdmin(true, '1')).toBe(true)
        expect(actsAsAdmin(true, undefined)).toBe(false)
        expect(actsAsAdmin(false, '1')).toBe(false)
    })

    it('accepts only "1" as the header value', () => {
        expect(actsAsAdmin(true, 'true')).toBe(false)
        expect(actsAsAdmin(true, '0')).toBe(false)
    })
})
