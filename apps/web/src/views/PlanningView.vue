<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useDisplay } from 'vuetify'
import { useEventsStore } from '../stores/events.js'
import { useGroupsStore } from '../stores/groups.js'
import { useGroupOverride } from '../lib/group-override.js'
import { groupLabel } from '../lib/group-label.js'
import type { Event } from '../lib/types.js'
import WeekCalendar from '../components/WeekCalendar.vue'
import { mondayOfWeek, wallClockNow } from '../lib/date.js'

const { mobile } = useDisplay()
// Carried onto the changes page so `?group=` survives the jump.
const route = useRoute()
const groups = useGroupsStore()
const override = useGroupOverride()

// A single v-model over the url: picking a group writes `?group=`, clearing it
// (or picking one's own class) removes it.
const pickedGroupIds = computed({
    get: () => override.pickedIds.value,
    set: (ids: string[]) => override.set(ids),
})
const eventsStore = useEventsStore()
const events = ref<Event[]>([])
// Wall-clock, not `new Date()`: `mondayOfWeek` reads the UTC getters, so a real
// instant between midnight and 02h Paris still falls on the previous day and the
// view opened on last week.
const date = ref(wallClockNow())
const loading = ref(false)

watch(
    [() => override.groupIds.value, date],
    async ([newGroupIds, newDate], [oldGroupIds, oldDate]) => {
        if (newGroupIds.length === 0) {
            events.value = []
            return
        }
        // Paging within a week shows the same events; a group change never does.
        const sameGroups =
            oldGroupIds !== undefined &&
            oldGroupIds.length === newGroupIds.length &&
            newGroupIds.every((id) => oldGroupIds.includes(id))
        if (
            sameGroups &&
            oldDate &&
            mondayOfWeek(newDate as Date).getTime() === mondayOfWeek(oldDate as Date).getTime()
        )
            return
        loading.value = true
        try {
            events.value = await eventsStore.fetchWeekEvents(
                mondayOfWeek(newDate as Date),
                newGroupIds as string[],
            )
        } finally {
            loading.value = false
        }
    },
    { immediate: true, deep: true },
)
</script>

<template>
    <v-container fluid class="pa-4">
        <v-alert
            v-if="override.isActive.value"
            type="info"
            variant="tonal"
            density="compact"
            class="mb-4"
            icon="mdi-account-switch"
        >
            <div class="d-flex align-center ga-2 flex-wrap">
                <span>
                    Vous consultez le planning de
                    <strong>{{ override.labels.value.join(', ') }}</strong>
                    au lieu du vôtre.
                </span>
                <v-spacer />
                <v-btn size="small" variant="text" @click="override.clear()">
                    Revenir au mien
                </v-btn>
            </div>
        </v-alert>
        <v-alert
            v-else-if="override.unknownNames.value.length > 0"
            type="warning"
            variant="tonal"
            density="compact"
            class="mb-4"
        >
            Groupe introuvable : {{ override.unknownNames.value.join(', ') }}.
        </v-alert>
        <WeekCalendar v-model="date" :events="events" :loading="loading">
            <template #prepend>
                <v-autocomplete
                    v-model="pickedGroupIds"
                    :items="groups.visibleGroups"
                    :item-title="groupLabel"
                    item-value="id"
                    label="Voir le planning de..."
                    multiple
                    chips
                    closable-chips
                    clearable
                    density="compact"
                    variant="outlined"
                    hide-details
                    style="max-width: 350px"
                />
            </template>
            <template #append>
                <v-tooltip text="Changements récents" location="start">
                    <template #activator="{ props }">
                        <v-btn
                            v-bind="props"
                            variant="tonal"
                            :to="{ path: '/planning/changes', query: route.query }"
                            icon="mdi-history"
                            :size="mobile ? 'small' : undefined"
                        />
                    </template>
                </v-tooltip>
                <v-tooltip text="Comparer" location="start">
                    <template #activator="{ props }">
                        <v-btn
                            v-bind="props"
                            variant="tonal"
                            to="/planning/compare"
                            icon="mdi-compare"
                            :size="mobile ? 'small' : undefined"
                        />
                    </template>
                </v-tooltip>
            </template>
        </WeekCalendar>
    </v-container>
</template>
