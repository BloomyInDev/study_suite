<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDisplay } from 'vuetify'
import { backend } from '../lib/api.js'
import { useEventsStore } from '../stores/events.js'
import { useGroupsStore } from '../stores/groups.js'
import { useGroupOverride } from '../lib/group-override.js'
import { groupLabel } from '../lib/group-label.js'
import type { Event, Teacher } from '../lib/types.js'
import WeekCalendar from '../components/WeekCalendar.vue'
import { mondayOfWeek, wallClockNow } from '../lib/date.js'

const { mobile } = useDisplay()
// Carried onto the changes page so `?group=` survives the jump.
const route = useRoute()
const router = useRouter()
const groups = useGroupsStore()
const override = useGroupOverride()

// `?teacher=<id>` shows that teacher's timetable, and wins over `?group=`: it is
// where the teacher dialog's "full planning" button lands.
const teacherId = computed(() =>
    typeof route.query.teacher === 'string' && route.query.teacher ? route.query.teacher : null,
)
const teacher = ref<Teacher | null>(null)
const teacherNotFound = ref(false)

watch(
    teacherId,
    async (id) => {
        teacher.value = null
        teacherNotFound.value = false
        if (!id) return
        const res = await backend.api.teachers[':id'].$get({ param: { id }, query: {} })
        const body = await res.json()
        if (id !== teacherId.value) return
        if ('data' in body) teacher.value = body.data
        else teacherNotFound.value = true
    },
    { immediate: true },
)

const clearTeacher = () => {
    const query = { ...route.query }
    delete query.teacher
    void router.push({ path: route.path, query })
}

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

// Switching between a teacher and a group, or paging faster than the api
// answers, would otherwise let an older response land last.
let requestId = 0

watch(
    [teacherId, () => override.groupIds.value, date],
    async ([newTeacherId, newGroupIds, newDate], [oldTeacherId, oldGroupIds, oldDate]) => {
        // Paging within a week shows the same events; a teacher or group change never does.
        const sameWeek =
            oldDate !== undefined &&
            mondayOfWeek(newDate as Date).getTime() === mondayOfWeek(oldDate as Date).getTime()
        const sameTeacher = newTeacherId === oldTeacherId
        const sameGroups =
            oldGroupIds !== undefined &&
            oldGroupIds.length === newGroupIds.length &&
            newGroupIds.every((id) => oldGroupIds.includes(id))
        if (sameWeek && sameTeacher && (newTeacherId !== null || sameGroups)) return

        const token = ++requestId
        if (newTeacherId === null && newGroupIds.length === 0) {
            events.value = []
            loading.value = false
            return
        }
        loading.value = true
        try {
            const fetched = newTeacherId
                ? await eventsStore.fetchTeacherWeekEvents(newTeacherId, newDate as Date)
                : await eventsStore.fetchWeekEvents(
                      mondayOfWeek(newDate as Date),
                      newGroupIds as string[],
                  )
            if (token !== requestId) return
            events.value = fetched ?? []
        } finally {
            if (token === requestId) loading.value = false
        }
    },
    { immediate: true, deep: true },
)
</script>

<template>
    <v-container fluid class="pa-4">
        <v-alert
            v-if="teacher"
            type="info"
            variant="tonal"
            density="compact"
            class="mb-4"
            icon="mdi-account-tie"
        >
            <div class="d-flex align-center ga-2 flex-wrap">
                <span>
                    Vous consultez le planning de
                    <strong>{{ teacher.firstName }} {{ teacher.lastName }}</strong
                    >.
                </span>
                <v-spacer />
                <v-btn size="small" variant="text" @click="clearTeacher()"> Revenir au mien </v-btn>
            </div>
        </v-alert>
        <v-alert
            v-else-if="teacherNotFound"
            type="warning"
            variant="tonal"
            density="compact"
            class="mb-4"
        >
            <div class="d-flex align-center ga-2 flex-wrap">
                <span>Enseignant introuvable.</span>
                <v-spacer />
                <v-btn size="small" variant="text" @click="clearTeacher()"> Revenir au mien </v-btn>
            </div>
        </v-alert>
        <v-alert
            v-else-if="!teacherId && override.isActive.value"
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
            v-else-if="!teacherId && override.unknownNames.value.length > 0"
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
                    v-if="!teacherId"
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
                <v-tooltip v-if="!teacherId" text="Changements récents" location="start">
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
