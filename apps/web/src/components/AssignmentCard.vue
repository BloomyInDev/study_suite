<script setup lang="ts">
import type { Assignment } from '../lib/types.js'
import { formatDueRelative } from '../lib/date.js'

defineProps<{
    assignment: Assignment
    compact?: boolean
}>()

defineEmits<{
    click: []
    toggle: [done: boolean]
}>()

function dueColor(iso: string) {
    const diff = new Date(iso).getTime() - Date.now()
    if (diff < 0) return 'error'
    if (diff < 24 * 60 * 60 * 1000) return 'warning'
    return undefined
}

function formatAbsolute(iso: string) {
    return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}
</script>

<template>
    <v-list-item
        :class="{ 'text-medium-emphasis': assignment.completedByMe }"
        rounded="lg"
        @click="$emit('click')"
    >
        <template #prepend>
            <v-checkbox-btn
                :model-value="assignment.completedByMe"
                density="compact"
                class="mr-1"
                @click.stop
                @update:model-value="$emit('toggle', $event)"
            />
        </template>

        <v-list-item-title
            :class="{ 'text-decoration-line-through': assignment.completedByMe }"
            class="font-weight-medium"
        >
            {{ assignment.title }}
        </v-list-item-title>

        <v-list-item-subtitle class="d-flex flex-wrap align-center ga-1 mt-1">
            <v-chip
                v-if="assignment.subject"
                size="x-small"
                variant="tonal"
                color="primary"
            >
                {{ assignment.subject }}
            </v-chip>
            <v-chip
                size="x-small"
                :color="dueColor(assignment.dueDate)"
                variant="tonal"
                prepend-icon="mdi-clock-outline"
            >
                {{ formatDueRelative(assignment.dueDate) }}
                <v-tooltip activator="parent" location="top">
                    {{ formatAbsolute(assignment.dueDate) }}
                </v-tooltip>
            </v-chip>
            <v-chip size="x-small" variant="tonal" prepend-icon="mdi-account-group">
                {{ assignment.studentGroup.internalName }}
            </v-chip>
        </v-list-item-subtitle>

        <template v-if="!compact" #append>
            <div class="text-caption text-medium-emphasis d-flex align-center ga-1 ml-2">
                <v-icon size="14">mdi-check-circle</v-icon>
                {{ assignment.completionCount }}
            </div>
        </template>
    </v-list-item>
</template>
