import { defineStore } from 'pinia'
import { backend } from '../lib/api.js'
import type { Group } from '../lib/types.js'
import { useAuthStore } from './auth.js'

const LS_KEY = 'study_suite_selected_groups'

/**
 * Read straight away, before any request: components mount before App.vue's
 * onMounted, and a homepage that loads with an empty selection asks for every
 * group's events.
 */
function storedGroupIds(): string[] {
    try {
        const raw = localStorage.getItem(LS_KEY)
        return raw ? (JSON.parse(raw) as string[]) : []
    } catch {
        return []
    }
}

export const useGroupsStore = defineStore('groups', {
    state: () => ({
        allGroups: [] as Group[],
        selectedGroupIds: storedGroupIds(),
    }),

    getters: {
        /** Groups offered to users; the admin view works off allGroups instead. */
        visibleGroups: (state): Group[] => state.allGroups.filter((g) => !g.hidden),

        /** The class attached to the account, when there is one. */
        accountGroupId: (): string | null => useAuthStore().user?.studentGroupId ?? null,

        /**
         * A signed-in student follows their own class — the manual picker is for
         * visitors who have no account to read it from.
         */
        activeGroupIds(state): string[] {
            return this.accountGroupId ? [this.accountGroupId] : state.selectedGroupIds
        },

        usesAccountGroup(): boolean {
            return this.accountGroupId !== null
        },

        selectedGroups(state): Group[] {
            return state.allGroups.filter((g) => this.activeGroupIds.includes(g.id))
        },

        /**
         * A group inherits its ancestors' events: a promo-wide lecture is tagged
         * on `BUT1`, not on `S5`. Anything asking the api for a group's events
         * has to widen the ids first or it silently drops those.
         */
        withAncestors(state) {
            return (groupIds: string[]): string[] => {
                const ids = new Set(groupIds)
                const addAncestors = (groupId: string) => {
                    const group = state.allGroups.find((g) => g.id === groupId)
                    for (const parent of group?.parents ?? []) {
                        if (!ids.has(parent.id)) {
                            ids.add(parent.id)
                            addAncestors(parent.id)
                        }
                    }
                }
                for (const id of groupIds) addAncestors(id)
                return [...ids]
            }
        },

        effectiveGroupIds(): string[] {
            return this.withAncestors(this.activeGroupIds)
        },
    },

    actions: {
        // Always the full graph: hiding is a display concern, but the hierarchy
        // still has to resolve through hidden nodes (see effectiveGroupIds).
        async fetchAll() {
            const res = await backend.api.groups.$get({ query: { includeHidden: 'true' } })
            const { data } = await res.json()
            this.allGroups = data
        },

        /** Drop ids that no longer exist, once the real list is known. */
        pruneUnknownGroups() {
            this.selectedGroupIds = this.selectedGroupIds.filter((id) =>
                this.allGroups.some((g) => g.id === id),
            )
        },

        select(ids: string[]) {
            this.selectedGroupIds = ids.filter((id) => this.allGroups.some((g) => g.id === id))
            localStorage.setItem(LS_KEY, JSON.stringify(this.selectedGroupIds))
        },

        clear() {
            this.selectedGroupIds = []
            localStorage.removeItem(LS_KEY)
        },

        async onLoad() {
            await this.fetchAll()
            this.pruneUnknownGroups()
        },
    },
})
