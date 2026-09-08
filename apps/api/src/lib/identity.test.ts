import { describe, expect, it } from 'vitest'
import { iutSubject } from './oidc-claims.js'
import { pickDisplay, type IdentitySummary } from './identity-display.js'

const identity = (over: Partial<IdentitySummary>): IdentitySummary => ({
    provider: 'discord',
    subject: 's',
    username: null,
    avatarUrl: null,
    ...over,
})

describe('iutSubject', () => {
    const dn = 'uid=lubenb,ou=Ann3,ou=Etudiants,ou=people,dc=info,dc=iutmontp,dc=univ-montp2,dc=fr'

    it('keys on preferred_username, never the DN', () => {
        expect(iutSubject({ sub: dn, preferred_username: 'lubenb' })).toBe('lubenb')
    })

    // The DN carries the year: keying on it would orphan the account every
    // September, when ou=Ann2 becomes ou=Ann3 for the same person.
    it('is stable across a year rollover', () => {
        const nextYear = dn.replace('Ann3', 'Ann4')
        expect(iutSubject({ sub: dn, preferred_username: 'lubenb' })).toBe(
            iutSubject({ sub: nextYear, preferred_username: 'lubenb' }),
        )
    })

    it('falls back to the uid inside the DN', () => {
        expect(iutSubject({ sub: dn })).toBe('lubenb')
    })

    it('gives up rather than key on something unstable', () => {
        expect(iutSubject({ sub: 'cn=Luben Bastien,ou=people' })).toBeNull()
        expect(iutSubject({})).toBeNull()
    })
})

describe('pickDisplay', () => {
    it('prefers the Discord name, which the app already shows everywhere', () => {
        expect(
            pickDisplay([
                identity({ provider: 'iut', subject: 'lubenb', username: 'Luben Bastien' }),
                identity({ provider: 'discord', subject: '204', username: 'bastien' }),
            ]).displayName,
        ).toBe('bastien')
    })

    it('falls back to the IUT name for an account with no Discord', () => {
        const { displayName, avatarUrl } = pickDisplay([
            identity({ provider: 'iut', subject: 'lubenb', username: 'Luben Bastien' }),
        ])
        expect(displayName).toBe('Luben Bastien')
        expect(avatarUrl).toBeNull()
    })

    it('falls back to the subject when the provider gave no name', () => {
        expect(pickDisplay([identity({ provider: 'iut', subject: 'lubenb' })]).displayName).toBe(
            'lubenb',
        )
    })
})
