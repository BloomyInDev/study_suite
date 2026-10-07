<script setup lang="ts">
import { groupLabel } from '../lib/group-label.js'
import { API_URL } from '../lib/api-url'
import { computed, onMounted, ref, watch } from 'vue'
import { useGroupsStore } from '../stores/groups.js'
import { useNotificationsStore } from '../stores/notifications.js'
import { useAuthStore } from '../stores/auth.js'
import { useEventsStore } from '../stores/events.js'
import type { Assignment, Event } from '../lib/types.js'
import { addParisDays, formatShortDay, formatTime, parisDayStart } from '../lib/date.js'

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
const auth = useAuthStore()
const eventsStore = useEventsStore()

const show = computed({
    get: () => props.modelValue,
    set: (v) => emit('update:modelValue', v),
})

const saving = ref(false)
const deleting = ref(false)
const confirmDelete = ref(false)
const subjectOptions = ref<string[]>([])

/** How far ahead the course picker looks; a term's worth of timetable. */
const COURSE_WINDOW_DAYS = 60

const dueMode = ref<'date' | 'event'>('date')
const courses = ref<Event[]>([])
const loadingCourses = ref(false)
// Only the newest load may write `courses`: switching group twice in a row
// otherwise lets the slower first answer land last.
let courseLoadToken = 0

onMounted(async () => {
    const res = await fetch(`${API_URL}/api/events/titles`)
    if (res.ok) {
        const body = (await res.json()) as { data: string[] }
        subjectOptions.value = body.data
    }
})

const form = ref({
    title: '',
    subject: '',
    description: '',
    dueDate: '',
    studentGroupId: '',
    eventId: null as string | null,
})

const isEditing = computed(() => !!props.editing)
const dialogTitle = computed(() => (isEditing.value ? 'Modifier le devoir' : 'Nouveau devoir'))

watch(
    () => props.modelValue,
    (open) => {
        if (!open) return
        confirmDelete.value = false
        if (props.editing) {
            const d = new Date(props.editing.dueDate)
            dueMode.value = props.editing.event ? 'event' : 'date'
            form.value = {
                title: props.editing.title,
                subject: props.editing.subject ?? '',
                description: props.editing.description ?? '',
                dueDate: toDatetimeLocal(d),
                studentGroupId: props.editing.studentGroup.id,
                eventId: props.editing.event?.id ?? null,
            }
        } else {
            dueMode.value = 'date'
            const defaultGroup = groups.selectedGroups[0]?.id ?? groups.allGroups[0]?.id ?? ''
            const tomorrow = new Date()
            tomorrow.setDate(tomorrow.getDate() + 1)
            tomorrow.setHours(23, 59, 0, 0)
            form.value = {
                title: '',
                subject: '',
                description: '',
                dueDate: toDatetimeLocal(tomorrow),
                studentGroupId: defaultGroup,
                eventId: null,
            }
        }
    },
)

// The picker is only worth loading once it is asked for, but an assignment
// already tied to a course opens on it, so both the mode and the group matter.
watch(
    [() => props.modelValue, dueMode, () => form.value.studentGroupId],
    ([open]) => {
        if (open && dueMode.value === 'event') void loadCourses()
    },
    { immediate: true },
)

async function loadCourses() {
    const groupId = form.value.studentGroupId
    const token = ++courseLoadToken
    if (!groupId) {
        courses.value = []
        return
    }
    loadingCourses.value = true
    try {
        const from = parisDayStart()
        const to = addParisDays(from, COURSE_WINDOW_DAYS)
        // A promo-wide lecture is tagged on the parent group, not on the class.
        const list = await eventsStore.fetchRange(groups.withAncestors([groupId]), from, to)

        // An assignment set in a course that has already happened would
        // otherwise open on an id the autocomplete cannot name.
        const linked = form.value.eventId
        if (linked && !list.some((e) => e.id === linked)) {
            const pinned = await eventsStore.fetchById(linked)
            if (pinned) list.unshift(pinned)
        }

        if (token === courseLoadToken) courses.value = list
    } finally {
        if (token === courseLoadToken) loadingCourses.value = false
    }
}

const courseItems = computed(() =>
    courses.value.map((e) => ({
        value: e.id,
        title: e.title,
        subtitle: [
            `${formatShortDay(e.start)} · ${formatTime(e.start)} – ${formatTime(e.end)}`,
            e.rooms.map((r) => r.name).join(', '),
        ]
            .filter(Boolean)
            .join(' · '),
    })),
)

function onCourseSelected(id: string | null) {
    form.value.eventId = id
    const course = courses.value.find((e) => e.id === id)
    if (!course) return
    form.value.dueDate = toDatetimeLocal(course.start)
    if (!form.value.subject.trim()) form.value.subject = course.title
}

// A due date typed by hand is no longer "at that course".
watch(dueMode, (mode) => {
    if (mode === 'date') form.value.eventId = null
})

function toDatetimeLocal(d: Date) {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** The chosen course's start, as a real instant, for the picker's hint. */
function formatDueAbsolute(datetimeLocal: string) {
    if (!datetimeLocal) return ''
    return new Date(datetimeLocal).toLocaleString('fr-FR', {
        dateStyle: 'full',
        timeStyle: 'short',
    })
}

function authHeader() {
    return { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
}

async function save() {
    if (!form.value.title.trim() || !form.value.dueDate || !form.value.studentGroupId) return
    if (dueMode.value === 'event' && !form.value.eventId) return
    saving.value = true
    try {
        const payload = {
            title: form.value.title.trim(),
            subject: form.value.subject.trim() || undefined,
            description: form.value.description || undefined,
            dueDate: new Date(form.value.dueDate).toISOString(),
            studentGroupId: form.value.studentGroupId,
            // `null` clears the link on an edit; the create schema takes no
            // null, so a new assignment simply omits it.
            eventId: form.value.eventId ?? (isEditing.value ? null : undefined),
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
    <v-dialog v-model="show" max-width="560" scrollable>
        <v-card>
            <v-card-title class="pt-4 px-4 d-flex align-center">
                {{ dialogTitle }}
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
                        <v-autocomplete
                            v-model="form.subject"
                            label="Matière"
                            variant="outlined"
                            density="compact"
                            hide-details
                            clearable
                            :items="subjectOptions"
                        />
                    </v-col>

                    <v-col cols="12" sm="6">
                        <v-select
                            v-model="form.studentGroupId"
                            label="Groupe *"
                            variant="outlined"
                            density="compact"
                            hide-details
                            :disabled="!auth.isAdmin"
                            :items="
                                groups.visibleGroups.map((g) => ({
                                    title: groupLabel(g),
                                    value: g.id,
                                }))
                            "
                        />
                    </v-col>

                    <v-col cols="12" sm="6" class="d-flex align-center">
                        <v-btn-toggle
                            v-model="dueMode"
                            mandatory
                            density="compact"
                            variant="outlined"
                            divided
                        >
                            <v-btn value="date" size="small" prepend-icon="mdi-calendar-clock">
                                Date
                            </v-btn>
                            <v-btn value="event" size="small" prepend-icon="mdi-school">
                                Cours
                            </v-btn>
                        </v-btn-toggle>
                    </v-col>

                    <v-col v-if="dueMode === 'date'" cols="12" sm="6">
                        <v-text-field
                            v-model="form.dueDate"
                            label="Date limite *"
                            type="datetime-local"
                            variant="outlined"
                            density="compact"
                            hide-details
                        />
                    </v-col>

                    <v-col v-else cols="12" sm="6">
                        <v-autocomplete
                            :model-value="form.eventId"
                            label="Pour le cours *"
                            variant="outlined"
                            density="compact"
                            clearable
                            item-props
                            :items="courseItems"
                            :loading="loadingCourses"
                            :no-data-text="
                                loadingCourses ? 'Chargement…' : 'Aucun cours dans les 60 jours'
                            "
                            :hint="
                                form.eventId ? `Rendu le ${formatDueAbsolute(form.dueDate)}` : ''
                            "
                            persistent-hint
                            @update:model-value="onCourseSelected"
                        />
                    </v-col>

                    <v-col cols="12">
                        <v-textarea
                            v-model="form.description"
                            label="Description (Markdown)"
                            variant="outlined"
                            density="compact"
                            rows="5"
                            hide-details
                            no-resize
                            placeholder="Décrivez le devoir…"
                        />
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
                        <v-btn variant="text" size="small" @click="confirmDelete = false"
                            >Non</v-btn
                        >
                    </template>
                </template>
                <v-spacer />
                <v-btn variant="text" @click="show = false">Annuler</v-btn>
                <v-btn
                    color="primary"
                    variant="tonal"
                    :loading="saving"
                    :disabled="
                        !form.title.trim() ||
                        !form.dueDate ||
                        !form.studentGroupId ||
                        (dueMode === 'event' && !form.eventId)
                    "
                    @click="save"
                >
                    Enregistrer
                </v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>
