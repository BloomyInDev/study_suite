<script setup lang="ts">
import type { Assignment } from '../lib/types.js'

defineProps<{
    assignment: Assignment
    compact?: boolean
}>()

defineEmits<{
    click: []
    toggle: [done: boolean]
}>()

function formatDue(iso: string) {
    const d = new Date(iso)
    return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}

function dueColor(iso: string) {
    const diff = new Date(iso).getTime() - Date.now()
    if (diff < 0) return 'error'
    if (diff < 24 * 60 * 60 * 1000) return 'warning'
    return 'default'
}
</script>

<template>
    <v-card
        :variant="assignment.completedByMe ? 'tonal' : 'outlined'"
        :color="assignment.completedByMe ? 'success' : undefined"
        class="assignment-card"
        @click="$emit('click')"
    >
        <v-card-item class="py-2">
            <template #prepend>
                <v-checkbox-btn
                    :model-value="assignment.completedByMe"
                    density="compact"
                    @click.stop
                    @update:model-value="$emit('toggle', $event)"
                />
            </template>
            <v-card-title
                class="text-body-1 font-weight-medium"
                :class="{ 'text-decoration-line-through text-medium-emphasis': assignment.completedByMe }"
            >
                {{ assignment.title }}
            </v-card-title>
            <v-card-subtitle class="d-flex flex-wrap ga-2 mt-1">
                <v-chip
                    size="x-small"
                    :color="dueColor(assignment.dueDate)"
                    variant="tonal"
                    prepend-icon="mdi-clock-outline"
                >
                    {{ formatDue(assignment.dueDate) }}
                </v-chip>
                <v-chip size="x-small" variant="tonal" prepend-icon="mdi-account-group">
                    {{ assignment.studentGroup.internalName }}
                </v-chip>
                <v-chip
                    v-if="assignment.event"
                    size="x-small"
                    variant="tonal"
                    prepend-icon="mdi-book-open"
                >
                    {{ assignment.event.title }}
                </v-chip>
            </v-card-subtitle>
            <template v-if="!compact" #append>
                <div class="text-caption text-medium-emphasis d-flex align-center ga-1">
                    <v-icon size="14">mdi-check-circle</v-icon>
                    {{ assignment.completionCount }}
                </div>
            </template>
        </v-card-item>
    </v-card>
</template>

<style scoped>
.assignment-card {
    cursor: pointer;
    transition: opacity 0.15s;
}
</style>
