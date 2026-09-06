<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useEventsStore } from '../../stores/events.js'
import { useGroupsStore } from '../../stores/groups.js'
import { groupLabel } from '../../lib/group-label.js'
import {
    CHANGE_TYPES,
    changeTypeItems,
    formatDetected,
    formatSlot,
    groupByRun,
    relationDiff,
} from '../../lib/event-changes.js'
import type { ChangeType, EventChange } from '../../lib/types.js'

const eventsStore = useEventsStore()
const groups = useGroupsStore()

const changes = ref<EventChange[]>([])
const loading = ref(false)
const days = ref(14)
// Empty means every group, which is the point of the admin view.
const groupFilter = ref<string[]>([])
const typeFilter = ref<ChangeType[]>([])
const search = ref('')

// The api caps a page at 200; the whole school over 30 days can exceed that,
// so the window is the honest lever, not a bigger page.
const PAGE_LIMIT = 200

watch(
    [groupFilter, days],
    async ([newGroups, newDays]) => {
        if (import.meta.env.SSR) return
        loading.value = true
        try {
            changes.value = await eventsStore.fetchChanges(
                newGroups as string[],
                newDays as number,
                PAGE_LIMIT,
            )
        } finally {
            loading.value = false
        }
    },
    { immediate: true, deep: true },
)

const visible = computed(() => {
    const needle = search.value.trim().toLowerCase()
    return changes.value.filter((c) => {
        if (typeFilter.value.length > 0 && !typeFilter.value.includes(c.changeType)) return false
        if (!needle) return true
        return (
            c.title.toLowerCase().includes(needle) ||
            c.groups.some((g) => g.toLowerCase().includes(needle))
        )
    })
})

const batches = computed(() => groupByRun(visible.value))

/** How many of each type are on screen — the quickest read on a scraper run. */
const counts = computed(() => {
    const tally = { added: 0, removed: 0, moved: 0, updated: 0 }
    for (const change of visible.value) tally[change.changeType]++
    return tally
})

const truncated = computed(() => changes.value.length >= PAGE_LIMIT)
</script>

<template>
    <v-container fluid class="pa-4">
        <div class="d-flex align-center ga-2 mb-1 flex-wrap">
            <div class="text-h6">Changements du planning</div>
            <v-spacer />
            <v-chip
                v-for="type in changeTypeItems"
                :key="type.value"
                :color="CHANGE_TYPES[type.value].color"
                :prepend-icon="CHANGE_TYPES[type.value].icon"
                size="small"
                variant="tonal"
            >
                {{ counts[type.value] }} {{ type.title.toLowerCase() }}
            </v-chip>
        </div>

        <v-row dense class="mb-2">
            <v-col cols="12" md="4">
                <v-autocomplete
                    v-model="groupFilter"
                    :items="groups.allGroups"
                    :item-title="groupLabel"
                    item-value="id"
                    label="Tous les groupes"
                    multiple
                    chips
                    closable-chips
                    clearable
                    density="compact"
                    variant="outlined"
                    hide-details
                />
            </v-col>
            <v-col cols="12" md="3">
                <v-select
                    v-model="typeFilter"
                    :items="changeTypeItems"
                    label="Type"
                    multiple
                    chips
                    closable-chips
                    clearable
                    density="compact"
                    variant="outlined"
                    hide-details
                />
            </v-col>
            <v-col cols="6" md="2">
                <v-select
                    v-model="days"
                    :items="[
                        { value: 1, title: '24 heures' },
                        { value: 7, title: '7 jours' },
                        { value: 14, title: '14 jours' },
                        { value: 30, title: '30 jours' },
                        { value: 90, title: '90 jours' },
                    ]"
                    density="compact"
                    variant="outlined"
                    hide-details
                />
            </v-col>
            <v-col cols="6" md="3">
                <v-text-field
                    v-model="search"
                    label="Rechercher"
                    prepend-inner-icon="mdi-magnify"
                    clearable
                    density="compact"
                    variant="outlined"
                    hide-details
                />
            </v-col>
        </v-row>

        <v-alert
            v-if="truncated"
            type="warning"
            variant="tonal"
            density="compact"
            class="mb-2"
            icon="mdi-alert-outline"
        >
            {{ PAGE_LIMIT }} changements affichés au maximum — réduisez la période pour tout voir.
        </v-alert>

        <v-sheet class="position-relative" min-height="200">
            <v-progress-linear :active="loading" indeterminate color="primary" absolute top />

            <v-alert
                v-if="!loading && batches.length === 0"
                type="info"
                variant="tonal"
                density="compact"
                class="mt-4"
            >
                Aucun changement sur cette période.
            </v-alert>

            <div v-for="batch in batches" :key="batch.detectedAt" class="mt-4">
                <div class="text-overline text-medium-emphasis">
                    Relevé du {{ formatDetected(batch.detectedAt) }} —
                    {{ batch.items.length }} changement{{ batch.items.length > 1 ? 's' : '' }}
                </div>
                <v-table density="compact">
                    <tbody>
                        <tr v-for="change in batch.items" :key="change.id">
                            <td style="width: 120px">
                                <v-chip
                                    :color="CHANGE_TYPES[change.changeType].color"
                                    :prepend-icon="CHANGE_TYPES[change.changeType].icon"
                                    size="x-small"
                                    variant="tonal"
                                >
                                    {{ CHANGE_TYPES[change.changeType].label }}
                                </v-chip>
                            </td>
                            <td>
                                <div class="font-weight-medium">{{ change.title }}</div>
                                <div class="text-caption text-medium-emphasis">
                                    {{ change.groups.join(', ') || 'Aucun groupe' }}
                                </div>
                            </td>
                            <td>
                                <div class="text-body-2">
                                    <span
                                        :class="
                                            change.newStart ? 'text-decoration-line-through' : ''
                                        "
                                    >
                                        {{ formatSlot(change.start, change.end) }}
                                    </span>
                                    <template v-if="change.newStart && change.newEnd">
                                        <v-icon
                                            icon="mdi-arrow-right"
                                            size="x-small"
                                            class="mx-1"
                                        />
                                        <strong>
                                            {{ formatSlot(change.newStart, change.newEnd) }}
                                        </strong>
                                    </template>
                                </div>
                                <div
                                    v-for="row in relationDiff(change)"
                                    :key="row.label"
                                    class="text-caption text-medium-emphasis"
                                >
                                    {{ row.label }} :
                                    <span class="text-decoration-line-through">
                                        {{ row.before }}
                                    </span>
                                    <v-icon icon="mdi-arrow-right" size="x-small" class="mx-1" />
                                    {{ row.after }}
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </v-table>
            </div>
        </v-sheet>
    </v-container>
</template>

<style scoped>
.position-relative {
    position: relative;
}
</style>
