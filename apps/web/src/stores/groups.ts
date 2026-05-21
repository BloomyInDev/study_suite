import { defineStore } from 'pinia'
import { backend } from '../lib/api.js'
import type { Group } from '../lib/types.js'

const LS_KEY = 'study_suite_selected_groups'

export const useGroupsStore = defineStore('groups', {
    state: () => ({
        allGroups: [] as Group[],
        selectedGroupIds: [] as string[],
    }),

    getters: {
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
        async fetchAll() {
            const res = await backend.api.groups.$get()
            const { data } = await res.json()
            this.allGroups = data
        },

        hydrateFromStorage() {
            try {
                const stored = localStorage.getItem(LS_KEY)
                if (stored) {
                    const ids: string[] = JSON.parse(stored)
                    this.selectedGroupIds = ids.filter((id) =>
                        this.allGroups.some((g) => g.id === id),
                    )
                }
            } catch {
                this.selectedGroupIds = []
            }
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
            this.hydrateFromStorage()
        },
    },
})
