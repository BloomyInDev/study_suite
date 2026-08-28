import { defineStore } from 'pinia'
import { backend } from '../lib/api.js'
import type { Group } from '../lib/types.js'

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

        selectedGroups: (state): Group[] =>
            state.allGroups.filter((g) => state.selectedGroupIds.includes(g.id)),

        effectiveGroupIds: (state): string[] => {
            const ids = new Set(state.selectedGroupIds)
            const addAncestors = (groupId: string) => {
                const group = state.allGroups.find((g) => g.id === groupId)
                for (const parent of group?.parents ?? []) {
                    if (!ids.has(parent.id)) {
                        ids.add(parent.id)
                        addAncestors(parent.id)
                    }
                }
            }
            for (const id of state.selectedGroupIds) addAncestors(id)
            return [...ids]
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
