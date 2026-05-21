<script setup lang="ts">
import { computed } from 'vue'
import type { TeacherWithDetails } from '../lib/types.js'
import { formatTime } from '../lib/date.js'
import EventDetailsDialog from './EventDetailsDialog.vue'

const props = defineProps<{
    modelValue: boolean
    teacher: TeacherWithDetails | null
    loading: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const show = computed({
    get: () => props.modelValue,
    set: (v) => emit('update:modelValue', v),
})
</script>

<template>
    <v-dialog v-model="show" max-width="600">
        <v-card>
            <div v-if="loading" class="d-flex flex-column justify-center align-center pa-8">
                <v-progress-circular indeterminate color="primary" />
                <p class="text-center mt-2">Récupération des informations de l'enseignant</p>
            </div>
            <template v-else-if="teacher">
                <v-card-title class="text-h5 pt-4 px-4">
                    {{ teacher.firstName }} {{ teacher.lastName }}
                    <v-btn
                        icon="mdi-close"
                        variant="text"
                        size="small"
                        class="float-right"
                        @click="show = false"
                    />
                </v-card-title>
                <v-card-text class="pa-4">
                    <div class="mb-6">
                        <v-chip
                            :color="teacher.available ? 'success' : 'error'"
                            class="font-weight-bold"
                        >
                            {{
                                teacher.available
                                    ? 'Actuellement disponible'
                                    : 'Actuellement en cours'
                            }}
                        </v-chip>
                    </div>
                    <div v-if="teacher.currentEvent" class="mb-6">
                        <h3 class="text-h6 mb-2 text-primary">Cours actuel</h3>
                        <EventDetailsDialog :event="teacher.currentEvent">
                            <template #activator="{ props: aProps }">
                                <v-card
                                    v-bind="aProps"
                                    variant="tonal"
                                    color="primary"
                                    class="pa-2 cursor-pointer"
                                    link
                                >
                                    <v-card-item>
                                        <template #title>{{
                                            teacher.currentEvent!.title
                                        }}</template>
                                        <template #subtitle>
                                            <div class="d-flex align-center mt-1">
                                                <v-icon
                                                    icon="mdi-map-marker"
                                                    size="small"
                                                    class="mr-1"
                                                />
                                                {{
                                                    teacher
                                                        .currentEvent!.rooms.map((r) => r.name)
                                                        .join(', ')
                                                }}
                                            </div>
                                            <div class="d-flex align-center mt-1">
                                                <v-icon
                                                    icon="mdi-clock-outline"
                                                    size="small"
                                                    class="mr-1"
                                                />
                                                {{ formatTime(teacher.currentEvent!.start) }} -
                                                {{ formatTime(teacher.currentEvent!.end) }}
                                            </div>
                                        </template>
                                    </v-card-item>
                                </v-card>
                            </template>
                        </EventDetailsDialog>
                    </div>
                    <div>
                        <h3 class="text-h6 mb-2 text-primary">Planning du jour</h3>
                        <div v-if="teacher.todayEvents.length > 0">
                            <v-list lines="two" density="compact" class="bg-transparent">
                                <EventDetailsDialog
                                    v-for="event in teacher.todayEvents"
                                    :key="event.id"
                                    :event="event"
                                >
                                    <template #activator="{ props: aProps }">
                                        <v-list-item
                                            v-bind="aProps"
                                            class="mb-2 rounded border cursor-pointer"
                                            link
                                        >
                                            <v-list-item-title class="font-weight-bold">{{
                                                event.title
                                            }}</v-list-item-title>
                                            <v-list-item-subtitle>
                                                <span class="mr-3">
                                                    <v-icon icon="mdi-map-marker" size="x-small" />
                                                    {{ event.rooms.map((r) => r.name).join(', ') }}
                                                </span>
                                                <span>
                                                    <v-icon
                                                        icon="mdi-clock-outline"
                                                        size="x-small"
                                                    />
                                                    {{ formatTime(event.start) }} -
                                                    {{ formatTime(event.end) }}
                                                </span>
                                            </v-list-item-subtitle>
                                        </v-list-item>
                                    </template>
                                </EventDetailsDialog>
                            </v-list>
                        </div>
                        <v-alert v-else type="info" variant="tonal" density="compact">
                            Aucun cours prévu aujourd'hui.
                        </v-alert>
                    </div>
                </v-card-text>
            </template>
        </v-card>
    </v-dialog>
</template>
