<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { courseProgress, semesterWindow } from '../lib/course-progress.js'
import type { Event } from '../lib/types.js'
import { useEventsStore } from '../stores/events.js'
import { useGroupsStore } from '../stores/groups.js'
import { useHiddenCoursesStore } from '../stores/hidden-courses.js'

/** How many sessions of each course of the semester are behind the student. */
const eventsStore = useEventsStore()
const groups = useGroupsStore()
const hiddenCourses = useHiddenCoursesStore()

const events = ref<Event[]>([])
const loading = ref(true)
let token = 0

// The hierarchy arrives after mount, and the ancestors carry the promo-wide
// courses, so reload when they join in.
watch(
    () => groups.effectiveGroupIds.join(','),
    async () => {
        if (import.meta.env.SSR) return
        const ids = groups.effectiveGroupIds
        if (ids.length === 0) return
        const mine = ++token
        loading.value = true
        try {
            const { from, to } = semesterWindow(new Date())
            const fetched = await eventsStore.fetchRange(ids, from, to)
            if (mine === token) events.value = fetched
        } finally {
            if (mine === token) loading.value = false
        }
    },
    { immediate: true },
)

const courses = computed(() => courseProgress(events.value, new Date(), hiddenCourses.titles))
</script>

<template>
    <v-card>
        <v-card-item>
            <template #prepend>
                <v-icon color="primary" size="32">mdi-progress-check</v-icon>
            </template>
            <v-card-title>Avancement</v-card-title>
            <v-card-subtitle>Séances passées, selon le planning publié</v-card-subtitle>
        </v-card-item>
        <v-card-text>
            <v-progress-linear v-if="loading" indeterminate color="primary" />
            <p v-else-if="courses.length === 0" class="text-medium-emphasis">
                Aucun cours ce semestre.
            </p>
            <div v-else class="progress-list">
                <div
                    v-for="c in courses"
                    :key="c.title"
                    class="mb-3"
                    :class="{ 'text-medium-emphasis': c.done >= c.total }"
                >
                    <div class="d-flex justify-space-between text-body-2 mb-1 ga-2">
                        <span class="text-truncate">{{ c.title }}</span>
                        <span class="flex-shrink-0 d-flex align-center ga-1">
                            <v-icon v-if="c.done >= c.total" size="16" color="success">
                                mdi-check
                            </v-icon>
                            {{ c.done }} / {{ c.total }}
                        </span>
                    </div>
                    <!-- The planning's own colour, a pastel: a thicker bar on a
                         darker track keeps the filled part visible on white. -->
                    <v-progress-linear
                        :model-value="(c.done / c.total) * 100"
                        :color="c.color ?? 'primary'"
                        bg-color="on-surface"
                        :bg-opacity="0.18"
                        height="8"
                        rounded
                    />
                </div>
            </div>
        </v-card-text>
    </v-card>
</template>

<style scoped>
.progress-list {
    max-height: 360px;
    overflow-y: auto;
    padding-right: 4px;
}
</style>
