import { describe, expect, it } from 'vitest'
import { mayChangeAssignment } from './assignment-lock.js'

const student = { isTeacher: false, actsAsAdmin: false }
const teacher = { isTeacher: true, actsAsAdmin: false }
const admin = { isTeacher: false, actsAsAdmin: true }

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

    it('lets an admin acting as one change it', () => {
        expect(mayChangeAssignment(true, admin)).toBe(true)
    })
})
