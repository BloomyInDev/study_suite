import type { Group, GroupRef } from './types.js'

/** What a group is called in the UI: its display name, else the scraped name. */
export function groupLabel(group: Pick<Group | GroupRef, 'internalName' | 'displayName'>): string {
    return group.displayName?.trim() || group.internalName
}
