import { describe, expect, it } from 'vitest'
import { isAdminModeRequest, mayChangeAssignment } from './assignment-lock.js'

const student = { isTeacher: false, isAdmin: false, adminMode: false }
const teacher = { isTeacher: true, isAdmin: false, adminMode: false }
const admin = { isTeacher: false, isAdmin: true, adminMode: false }

describe('mayChangeAssignment', () => {
    it('leaves homework written by a student open to everyone in scope', () => {
        expect(mayChangeAssignment(false, student)).toBe(true)
        expect(mayChangeAssignment(false, teacher)).toBe(true)
        expect(mayChangeAssignment(false, admin)).toBe(true)
    })

    it('locks homework written by a teacher against students', () => {
        expect(mayChangeAssignment(true, student)).toBe(false)
    })

    it('lets another teacher change it', () => {
        expect(mayChangeAssignment(true, teacher)).toBe(true)
    })

    it('needs admin mode for an admin', () => {
        expect(mayChangeAssignment(true, admin)).toBe(false)
        expect(mayChangeAssignment(true, { ...admin, adminMode: true })).toBe(true)
    })

    it('ignores the admin mode header from a non-admin', () => {
        expect(mayChangeAssignment(true, { ...student, adminMode: true })).toBe(false)
    })
})

describe('isAdminModeRequest', () => {
    it('accepts only "1"', () => {
        expect(isAdminModeRequest('1')).toBe(true)
        expect(isAdminModeRequest('true')).toBe(false)
        expect(isAdminModeRequest('0')).toBe(false)
        expect(isAdminModeRequest(undefined)).toBe(false)
    })
})
