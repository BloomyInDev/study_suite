<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useEventsStore } from '../stores/events.js'
import { useGroupOverride } from '../lib/group-override.js'
import {
    CHANGE_TYPES,
    changeTypeItems,
    formatDetected,
    formatSlot,
    groupByRun,
    relationDiff,
} from '../lib/event-changes.js'
import type { ChangeType, EventChange } from '../lib/types.js'

const eventsStore = useEventsStore()
const override = useGroupOverride()

const changes = ref<EventChange[]>([])
const loading = ref(false)
const days = ref(14)
const typeFilter = ref<ChangeType[]>([])

watch(
    [() => override.groupIds.value, days],
    async ([groupIds, newDays]) => {
        // The static render has no api to talk to, and no account to render for.
        if (import.meta.env.SSR) return
        loading.value = true
        try {
            changes.value = await eventsStore.fetchChanges(groupIds as string[], newDays as number)
        } finally {
            loading.value = false
        }
    },
    { immediate: true, deep: true },
)

const batches = computed(() =>
    groupByRun(
        typeFilter.value.length === 0
            ? changes.value
            : changes.value.filter((c) => typeFilter.value.includes(c.changeType)),
    ),
)
</script>

<template>
    <v-container fluid class="pa-4">
        <v-row align="center" class="mb-2">
            <v-col cols="12" md="auto" class="d-flex align-center ga-2">
                <v-btn variant="text" to="/planning" icon="mdi-arrow-left" size="small" />
                <div>
                    <div class="text-h6">Changements</div>
                    <div class="text-caption text-medium-emphasis">
                        {{
                            override.isActive.value
                                ? override.labels.value.join(', ')
                                : 'Votre planning'
                        }}
                    </div>
                </div>
            </v-col>
            <v-spacer />
            <v-col cols="12" md="auto" class="d-flex align-center ga-2 flex-wrap">
                <v-select
                    v-model="days"
                    :items="[
                        { value: 7, title: '7 jours' },
                        { value: 14, title: '14 jours' },
                        { value: 30, title: '30 jours' },
                    ]"
                    density="compact"
                    variant="outlined"
                    hide-details
                    style="min-width: 130px"
                />
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
                    style="min-width: 220px"
                />
            </v-col>
        </v-row>

        <v-sheet class="position-relative" min-height="200">
            <v-progress-linear :active="loading" indeterminate color="primary" absolute top />

            <v-alert
                v-if="!loading && batches.length === 0"
                type="success"
                variant="tonal"
                density="compact"
                icon="mdi-check-circle-outline"
                class="mt-4"
            >
                Aucun changement détecté sur cette période.
            </v-alert>

            <div v-for="batch in batches" :key="batch.detectedAt" class="mt-4">
                <div class="text-overline text-medium-emphasis">
                    Relevé du {{ formatDetected(batch.detectedAt) }}
                </div>
                <v-card
                    v-for="change in batch.items"
                    :key="change.id"
                    variant="tonal"
                    :color="CHANGE_TYPES[change.changeType].color"
                    class="mb-2"
                >
                    <v-card-text class="py-2">
                        <div class="d-flex align-center ga-2 flex-wrap">
                            <v-icon :icon="CHANGE_TYPES[change.changeType].icon" size="small" />
                            <strong>{{ change.title }}</strong>
                            <v-chip size="x-small" variant="flat">
                                {{ CHANGE_TYPES[change.changeType].label }}
                            </v-chip>
                            <v-spacer />
                            <span v-if="change.groups.length > 0" class="text-caption">
                                {{ change.groups.join(', ') }}
                            </span>
                        </div>

                        <div class="text-body-2 mt-1">
                            <span
                                :class="
                                    change.changeType === 'moved'
                                        ? 'text-decoration-line-through'
                                        : ''
                                "
                            >
                                {{ formatSlot(change.start, change.end) }}
                            </span>
                            <template v-if="change.newStart && change.newEnd">
                                <v-icon icon="mdi-arrow-right" size="x-small" class="mx-1" />
                                <strong>{{ formatSlot(change.newStart, change.newEnd) }}</strong>
                            </template>
                        </div>

                        <div
                            v-for="row in relationDiff(change)"
                            :key="row.label"
                            class="text-caption mt-1"
                        >
                            {{ row.label }} :
                            <span class="text-decoration-line-through">{{ row.before }}</span>
                            <v-icon icon="mdi-arrow-right" size="x-small" class="mx-1" />
                            <strong>{{ row.after }}</strong>
                        </div>
                    </v-card-text>
                </v-card>
            </div>
        </v-sheet>
    </v-container>
</template>

<style scoped>
.position-relative {
    position: relative;
}
</style>
