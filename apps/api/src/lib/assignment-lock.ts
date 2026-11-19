/**
 * Homework a teacher wrote is theirs: students of the class must not move its
 * deadline or delete it. Only another teacher may, or an admin who asked for
 * it explicitly.
 *
 * Being admin is not enough on its own, because an admin is often a student
 * too. The admin has to send `X-Superuser: 1` (the web app's superuser mode),
 * so editing a teacher's homework is a deliberate act and never a side effect
 * of browsing with an admin account.
 */
export const SUPERUSER_HEADER = 'X-Superuser'

export type Editor = {
    isTeacher: boolean
    isAdmin: boolean
    /** The request carried the superuser header. Ignored unless `isAdmin`. */
    superuser: boolean
}

export function mayChangeAssignment(authorIsTeacher: boolean, editor: Editor): boolean {
    if (!authorIsTeacher) return true
    if (editor.isTeacher) return true
    return editor.isAdmin && editor.superuser
}

export function isSuperuserRequest(header: string | undefined): boolean {
    return header === '1'
}
