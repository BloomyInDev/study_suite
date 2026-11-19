/**
 * Homework a teacher wrote is theirs: students of the class must not move its
 * deadline or delete it. Only another teacher may, or an admin acting as one
 * (`actsAsAdmin()`, admin mode on), so editing a teacher's homework is a
 * deliberate act and never a side effect of browsing with an admin account.
 */
export type Editor = {
    isTeacher: boolean
    /** `actsAsAdmin()`: the flag and admin mode, not the flag alone. */
    actsAsAdmin: boolean
}

export function mayChangeAssignment(authorIsTeacher: boolean, editor: Editor): boolean {
    if (!authorIsTeacher) return true
    return editor.isTeacher || editor.actsAsAdmin
}
