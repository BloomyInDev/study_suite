import { describe, expect, it } from 'vitest'
import { isSuperuserRequest, mayChangeAssignment } from './assignment-lock.js'

const student = { isTeacher: false, isAdmin: false, superuser: false }
const teacher = { isTeacher: true, isAdmin: false, superuser: false }
const admin = { isTeacher: false, isAdmin: true, superuser: false }

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

    it('needs superuser mode for an admin', () => {
        expect(mayChangeAssignment(true, admin)).toBe(false)
        expect(mayChangeAssignment(true, { ...admin, superuser: true })).toBe(true)
    })

    it('ignores the superuser header from a non-admin', () => {
        expect(mayChangeAssignment(true, { ...student, superuser: true })).toBe(false)
    })
})

describe('isSuperuserRequest', () => {
    it('accepts only "1"', () => {
        expect(isSuperuserRequest('1')).toBe(true)
        expect(isSuperuserRequest('true')).toBe(false)
        expect(isSuperuserRequest('0')).toBe(false)
        expect(isSuperuserRequest(undefined)).toBe(false)
    })
})
