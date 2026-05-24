<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { backend } from '../lib/api.js'
import type { Teacher, TeacherWithDetails, Event } from '../lib/types.js'
import { enhanceEvent } from '../lib/types.js'
import TeacherCard from '../components/TeacherCard.vue'
import TeacherDetailsDialog from '../components/TeacherDetailsDialog.vue'

const teachers = ref<Teacher[]>([])
const search = ref('')
const loading = ref(true)

const selectedTeacher = ref<TeacherWithDetails | null>(null)
const dialogOpen = ref(false)
const loadingDetails = ref(false)

const filtered = computed(() => {
    const q = search.value.trim().toLowerCase()
    if (!q) return teachers.value
    return teachers.value.filter((t) => `${t.firstName} ${t.lastName}`.toLowerCase().includes(q))
})

onMounted(async () => {
    try {
        const res = await backend.api.teachers.$get()
        const { data } = await res.json()
        teachers.value = data
    } finally {
        loading.value = false
    }
})

async function openTeacher(teacher: Teacher) {
    dialogOpen.value = true
    loadingDetails.value = true
    selectedTeacher.value = null
    try {
        const now = new Date()
        const dayStart = new Date(
            Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0),
        )
        const dayEnd = new Date(
            Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999),
        )
        const [detailsRes, eventsRes] = await Promise.all([
            backend.api.teachers[':id'].$get({ param: { id: teacher.id } }),
            backend.api.teachers[':id'].events.$get({
                param: { id: teacher.id },
                query: { from: dayStart.getTime(), to: dayEnd.getTime() },
            }),
        ])
        const [detailsBody, eventsBody] = await Promise.all([detailsRes.json(), eventsRes.json()])
        if (!('data' in detailsBody) || !('data' in eventsBody)) throw new Error('Teacher not found')
        const todayEvents: Event[] = (eventsBody.data ?? []).map(enhanceEvent)
        const currentEvent = detailsBody.data.currentEvent
            ? enhanceEvent(detailsBody.data.currentEvent as Parameters<typeof enhanceEvent>[0])
            : null
        selectedTeacher.value = {
            ...teacher,
            available: detailsBody.data.available,
            currentEvent,
            todayEvents,
        }
    } finally {
        loadingDetails.value = false
    }
}
</script>

<template>
    <v-container fluid class="pa-4">
        <v-row class="mb-4" align="center">
            <v-col cols="12" md="6">
                <v-text-field
                    v-model="search"
                    prepend-inner-icon="mdi-magnify"
                    label="Rechercher un enseignant"
                    variant="outlined"
                    density="compact"
                    hide-details
                    clearable
                />
            </v-col>
        </v-row>

        <div v-if="loading" class="d-flex justify-center pa-8">
            <v-progress-circular indeterminate color="primary" size="48" />
        </div>

        <v-row v-else>
            <v-col
                v-for="teacher in filtered"
                :key="teacher.id"
                cols="12"
                sm="6"
                md="4"
                lg="3"
                @click="openTeacher(teacher)"
            >
                <TeacherCard :teacher="teacher" :available="teacher.available" />
            </v-col>
            <v-col v-if="filtered.length === 0" cols="12">
                <v-alert type="info" variant="tonal">Aucun enseignant trouvé.</v-alert>
            </v-col>
        </v-row>

        <TeacherDetailsDialog
            v-model="dialogOpen"
            :teacher="selectedTeacher"
            :loading="loadingDetails"
        />
    </v-container>
</template>
