<script setup lang="ts">
import { computed } from 'vue'
import { useAuthStore } from '../stores/auth.js'
import type { Assignment } from '../lib/types.js'
import { formatDueRelative } from '../lib/date.js'
import { renderMarkdown } from '../lib/markdown.js'

const props = defineProps<{
    modelValue: boolean
    assignment: Assignment | null
}>()
const emit = defineEmits<{
    'update:modelValue': [v: boolean]
    edit: []
    toggle: [done: boolean]
}>()

const auth = useAuthStore()

const show = computed({
    get: () => props.modelValue,
    set: (v) => emit('update:modelValue', v),
})

const descriptionHtml = computed(() =>
    props.assignment?.description ? renderMarkdown(props.assignment.description) : null,
)

function dueColor(iso: string) {
    const diff = new Date(iso).getTime() - Date.now()
    if (diff < 0) return 'error'
    if (diff < 24 * 60 * 60 * 1000) return 'warning'
    return 'default'
}

function formatAbsolute(iso: string) {
    return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
}

function formatAuthor(user: { discordUsername: string } | null, dateIso: string) {
    if (!user) return null
    return `${user.discordUsername} — ${formatAbsolute(dateIso)}`
}
</script>

<template>
    <v-dialog v-model="show" max-width="600" scrollable>
        <v-card v-if="assignment">
            <v-card-title class="pt-4 px-4 d-flex align-center ga-2 flex-wrap">
                <span class="flex-grow-1">{{ assignment.title }}</span>
                <v-chip
                    v-if="assignment.subject"
                    color="primary"
                    variant="tonal"
                    size="small"
                >
                    {{ assignment.subject }}
                </v-chip>
                <v-btn icon="mdi-close" variant="text" size="small" @click="show = false" />
            </v-card-title>

            <v-card-text class="pa-4">
                <div class="d-flex flex-wrap ga-2 mb-4">
                    <v-chip
                        :color="dueColor(assignment.dueDate)"
                        variant="tonal"
                        size="small"
                        prepend-icon="mdi-clock-outline"
                    >
                        {{ formatDueRelative(assignment.dueDate) }}
                        <v-tooltip activator="parent" location="top">
                            {{ formatAbsolute(assignment.dueDate) }}
                        </v-tooltip>
                    </v-chip>
                    <v-chip variant="tonal" size="small" prepend-icon="mdi-account-group">
                        {{ assignment.studentGroup.internalName }}
                    </v-chip>
                    <v-chip
                        v-if="assignment.event"
                        variant="tonal"
                        size="small"
                        prepend-icon="mdi-book-open"
                    >
                        {{ assignment.event.title }}
                    </v-chip>
                </div>

                <div
                    v-if="descriptionHtml"
                    class="markdown-body mb-4"
                    v-html="descriptionHtml"
                />
                <p v-else class="text-medium-emphasis text-body-2 mb-4">Aucune description.</p>

                <v-divider class="mb-3" />

                <div class="d-flex flex-column ga-1 text-caption text-medium-emphasis">
                    <span v-if="assignment.createdBy">
                        <v-icon size="12" class="mr-1">mdi-account-plus</v-icon>
                        Créé par {{ formatAuthor(assignment.createdBy, assignment.createdAt) }}
                    </span>
                    <span v-if="assignment.updatedBy">
                        <v-icon size="12" class="mr-1">mdi-pencil</v-icon>
                        Modifié par {{ formatAuthor(assignment.updatedBy, assignment.updatedAt) }}
                    </span>
                </div>
            </v-card-text>

            <v-card-actions class="px-4 pb-4">
                <v-checkbox-btn
                    :model-value="assignment.completedByMe"
                    :label="assignment.completedByMe ? 'Marqué comme fait' : 'Marquer comme fait'"
                    density="compact"
                    @update:model-value="$emit('toggle', $event)"
                />
                <v-spacer />
                <v-btn
                    v-if="auth.isApproved || auth.isAdmin"
                    variant="tonal"
                    color="primary"
                    prepend-icon="mdi-pencil"
                    size="small"
                    @click="$emit('edit')"
                >
                    Modifier
                </v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<style scoped>
.markdown-body :deep(p) { margin-bottom: 0.5em; }
.markdown-body :deep(ul), .markdown-body :deep(ol) { padding-left: 1.5em; margin-bottom: 0.5em; }
.markdown-body :deep(code) {
    background: rgba(var(--v-theme-surface-variant), 0.5);
    padding: 0.1em 0.3em;
    border-radius: 3px;
    font-size: 0.85em;
}
.markdown-body :deep(pre) {
    background: rgba(var(--v-theme-surface-variant), 0.5);
    padding: 0.75em;
    border-radius: 4px;
    overflow-x: auto;
    margin-bottom: 0.5em;
}
.markdown-body :deep(h1), .markdown-body :deep(h2), .markdown-body :deep(h3) {
    margin-bottom: 0.4em;
    font-weight: 600;
}
</style>
