<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useGroupsStore } from '../stores/groups.js'
import { useNotificationsStore } from '../stores/notifications.js'
import type { Assignment } from '../lib/types.js'
import { renderMarkdown } from '../lib/markdown.js'

const props = defineProps<{
    modelValue: boolean
    editing?: Assignment | null
}>()
const emit = defineEmits<{
    'update:modelValue': [v: boolean]
    saved: [a: Assignment]
    deleted: [id: string]
}>()

const groups = useGroupsStore()
const notifs = useNotificationsStore()
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

const show = computed({
    get: () => props.modelValue,
    set: (v) => emit('update:modelValue', v),
})

const saving = ref(false)
const deleting = ref(false)
const confirmDelete = ref(false)

const form = ref({
    title: '',
    description: '',
    dueDate: '',
    studentGroupId: '',
    eventId: null as string | null,
})

const descriptionPreview = computed(() =>
    form.value.description ? renderMarkdown(form.value.description) : '<em class="text-medium-emphasis">Aperçu…</em>',
)

const isEditing = computed(() => !!props.editing)
const title = computed(() => (isEditing.value ? 'Modifier le devoir' : 'Nouveau devoir'))

watch(
    () => props.modelValue,
    (open) => {
        if (!open) return
        confirmDelete.value = false
        if (props.editing) {
            const d = new Date(props.editing.dueDate)
            form.value = {
                title: props.editing.title,
                description: props.editing.description ?? '',
                dueDate: toDatetimeLocal(d),
                studentGroupId: props.editing.studentGroup.id,
                eventId: props.editing.event?.id ?? null,
            }
        } else {
            const defaultGroup = groups.selectedGroups[0]?.id ?? groups.allGroups[0]?.id ?? ''
            const tomorrow = new Date()
            tomorrow.setDate(tomorrow.getDate() + 1)
            tomorrow.setHours(23, 59, 0, 0)
            form.value = {
                title: '',
                description: '',
                dueDate: toDatetimeLocal(tomorrow),
                studentGroupId: defaultGroup,
                eventId: null,
            }
        }
    },
)

function toDatetimeLocal(d: Date) {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function authHeader() {
    return { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
}

async function save() {
    if (!form.value.title.trim() || !form.value.dueDate || !form.value.studentGroupId) return
    saving.value = true
    try {
        const payload = {
            title: form.value.title.trim(),
            description: form.value.description || undefined,
            dueDate: new Date(form.value.dueDate).toISOString(),
            studentGroupId: form.value.studentGroupId,
            eventId: form.value.eventId || undefined,
        }
        const url = isEditing.value
            ? `${API_URL}/api/assignments/${props.editing!.id}`
            : `${API_URL}/api/assignments`
        const res = await fetch(url, {
            method: isEditing.value ? 'PATCH' : 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader() },
            body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error('save failed')
        const body = (await res.json()) as { data: Assignment }
        emit('saved', body.data)
        show.value = false
        notifs.success(isEditing.value ? 'Devoir mis à jour' : 'Devoir créé')
    } catch {
        notifs.error('Erreur lors de la sauvegarde')
    } finally {
        saving.value = false
    }
}

async function deleteAssignment() {
    if (!props.editing) return
    deleting.value = true
    try {
        const res = await fetch(`${API_URL}/api/assignments/${props.editing.id}`, {
            method: 'DELETE',
            headers: authHeader(),
        })
        if (!res.ok) throw new Error('delete failed')
        emit('deleted', props.editing.id)
        show.value = false
        notifs.success('Devoir supprimé')
    } catch {
        notifs.error('Erreur lors de la suppression')
    } finally {
        deleting.value = false
        confirmDelete.value = false
    }
}
</script>

<template>
    <v-dialog v-model="show" max-width="860" scrollable>
        <v-card>
            <v-card-title class="pt-4 px-4 d-flex align-center">
                {{ title }}
                <v-spacer />
                <v-btn icon="mdi-close" variant="text" size="small" @click="show = false" />
            </v-card-title>

            <v-card-text class="pa-4">
                <v-row dense>
                    <v-col cols="12">
                        <v-text-field
                            v-model="form.title"
                            label="Titre *"
                            variant="outlined"
                            density="compact"
                            hide-details="auto"
                        />
                    </v-col>

                    <v-col cols="12" sm="6">
                        <v-text-field
                            v-model="form.dueDate"
                            label="Date limite *"
                            type="datetime-local"
                            variant="outlined"
                            density="compact"
                            hide-details
                        />
                    </v-col>

                    <v-col cols="12" sm="6">
                        <v-select
                            v-model="form.studentGroupId"
                            label="Groupe *"
                            variant="outlined"
                            density="compact"
                            hide-details
                            :items="groups.allGroups.map((g) => ({ title: g.internalName, value: g.id }))"
                        />
                    </v-col>

                    <v-col cols="12">
                        <div class="text-caption text-medium-emphasis mb-1">Description (Markdown)</div>
                        <v-row no-gutters class="markdown-editor">
                            <v-col cols="6" class="pr-1">
                                <v-textarea
                                    v-model="form.description"
                                    placeholder="Rédigez la description…"
                                    variant="outlined"
                                    density="compact"
                                    rows="8"
                                    hide-details
                                    no-resize
                                    class="h-100"
                                />
                            </v-col>
                            <v-col cols="6" class="pl-1">
                                <div
                                    class="markdown-preview rounded border pa-3 h-100"
                                    v-html="descriptionPreview"
                                />
                            </v-col>
                        </v-row>
                    </v-col>
                </v-row>
            </v-card-text>

            <v-card-actions class="px-4 pb-4">
                <template v-if="isEditing">
                    <v-btn
                        v-if="!confirmDelete"
                        color="error"
                        variant="text"
                        size="small"
                        prepend-icon="mdi-delete"
                        @click="confirmDelete = true"
                    >
                        Supprimer
                    </v-btn>
                    <template v-else>
                        <span class="text-caption text-error mr-2">Confirmer ?</span>
                        <v-btn
                            color="error"
                            variant="tonal"
                            size="small"
                            :loading="deleting"
                            @click="deleteAssignment"
                        >
                            Oui
                        </v-btn>
                        <v-btn variant="text" size="small" @click="confirmDelete = false">Non</v-btn>
                    </template>
                </template>
                <v-spacer />
                <v-btn variant="text" @click="show = false">Annuler</v-btn>
                <v-btn
                    color="primary"
                    variant="tonal"
                    :loading="saving"
                    :disabled="!form.title.trim() || !form.dueDate || !form.studentGroupId"
                    @click="save"
                >
                    Enregistrer
                </v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<style scoped>
.markdown-editor {
    min-height: 200px;
}
.markdown-preview {
    min-height: 200px;
    overflow-y: auto;
    font-size: 0.875rem;
    line-height: 1.6;
    border-color: rgba(var(--v-border-color), var(--v-border-opacity)) !important;
}
.markdown-preview :deep(p) { margin-bottom: 0.5em; }
.markdown-preview :deep(code) {
    background: rgba(var(--v-theme-surface-variant), 0.5);
    padding: 0.1em 0.3em;
    border-radius: 3px;
}
.markdown-preview :deep(pre) {
    background: rgba(var(--v-theme-surface-variant), 0.5);
    padding: 0.75em;
    border-radius: 4px;
    overflow-x: auto;
}
</style>
