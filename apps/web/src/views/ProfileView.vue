<script setup lang="ts">
import { groupLabel } from '../lib/group-label.js'
import { computed, onMounted, ref } from 'vue'
import GroupPickerDialog from '../components/GroupPickerDialog.vue'
import ReminderSettingsCard from '../components/ReminderSettingsCard.vue'
import { API_URL } from '../lib/api-url'
import { backend } from '../lib/api.js'
import { useHiddenCoursesStore } from '../stores/hidden-courses.js'
import { useAuthStore } from '../stores/auth.js'
import { useGroupsStore } from '../stores/groups.js'
import { useRemindersStore } from '../stores/reminders.js'
import { useNotificationsStore } from '../stores/notifications.js'
import { useProvidersStore } from '../stores/providers.js'

const groups = useGroupsStore()
const auth = useAuthStore()
const reminders = useRemindersStore()
const notifs = useNotificationsStore()
const providers = useProvidersStore()
const hiddenCourses = useHiddenCoursesStore()
const pickerOpen = ref(false)
const savingGroup = ref(false)
const classDraft = ref<string | null>(auth.user?.studentGroupId ?? null)

// Every title the planning holds, so a course can be hidden before it is next
// on screen. A hidden title that no longer exists stays listed, to be removed.
const courseTitles = ref<string[]>([])
const titleChoices = computed(() => [...new Set([...courseTitles.value, ...hiddenCourses.titles])])
onMounted(async () => {
    const res = await backend.api.events.titles.$get()
    if (res.ok) courseTitles.value = (await res.json()).data
})

function groupLabelById(id: string): string {
    const g = groups.allGroups.find((group) => group.id === id)
    return g ? groupLabel(g) : id
}

const myClass = computed(() => groups.allGroups.find((g) => g.id === auth.user?.studentGroupId))

/** What staff assigned; the student may pick this or anything under it. */
const assignedClass = computed(
    () => groups.allGroups.find((g) => g.id === auth.user?.assignedGroupId) ?? myClass.value,
)

/** The assigned class plus everything under it: a role can only grant S1, so
 *  the student picks S1a or S1b themselves. */
const classChoices = computed(() => {
    const root = assignedClass.value
    if (!root) return []
    const out = [root]
    const walk = (id: string) => {
        const g = groups.allGroups.find((x) => x.id === id)
        for (const child of g?.children ?? []) {
            const c = groups.allGroups.find((x) => x.id === child.id)
            if (c && !out.some((o) => o.id === c.id)) {
                out.push(c)
                walk(c.id)
            }
        }
    }
    walk(root.id)
    return out.map((g) => ({ title: groupLabel(g), value: g.id }))
})

const ICONS: Record<string, string> = { discord: 'fa:fab fa-discord', iut: 'mdi-school' }

const linkedAccounts = computed(() =>
    providers.providers.map((p) => ({
        key: p.id,
        label: p.label,
        icon: ICONS[p.id] ?? 'mdi-account',
        identity: auth.user?.identities.find((i) => i.provider === p.id) ?? null,
    })),
)

/**
 * The link flow is a redirect, so the app token cannot ride in a header. It
 * goes in the query the way it already does on the way back from a login.
 */
function linkIutUrl(): string {
    const callback = encodeURIComponent(window.location.origin + '/auth/callback')
    const token = encodeURIComponent(localStorage.getItem('auth_token') ?? '')
    return `${API_URL}/api/auth/iut?redirect_uri=${callback}&token=${token}`
}

async function saveClass() {
    if (!classDraft.value) return
    savingGroup.value = true
    try {
        const res = await fetch(`${API_URL}/api/auth/me/student-group`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
            },
            body: JSON.stringify({ studentGroupId: classDraft.value }),
        })
        if (!res.ok) {
            notifs.error('Impossible de changer de groupe')
            return
        }
        await auth.refresh()
        classDraft.value = auth.user?.studentGroupId ?? null
        notifs.success('Groupe mis à jour')
    } finally {
        savingGroup.value = false
    }
}
</script>

<template>
    <v-container>
        <v-row>
            <v-col v-if="myClass" cols="12" md="6">
                <v-card>
                    <v-card-title>Ma classe</v-card-title>
                    <v-card-subtitle>Utilisée pour les devoirs</v-card-subtitle>
                    <v-card-text>
                        <v-select
                            v-model="classDraft"
                            :items="classChoices"
                            label="Ma classe"
                            variant="outlined"
                            density="compact"
                            hide-details
                            class="mb-3"
                        />
                        <div class="text-caption text-medium-emphasis mb-3">
                            Vous pouvez préciser votre sous-groupe au sein de
                            {{ assignedClass ? groupLabel(assignedClass) : '' }}. Pour changer de
                            classe, demandez à un administrateur.
                        </div>
                        <v-btn
                            :loading="savingGroup"
                            :disabled="classDraft === auth.user?.studentGroupId"
                            color="primary"
                            variant="flat"
                            size="small"
                            @click="saveClass"
                            >Enregistrer</v-btn
                        >
                    </v-card-text>
                </v-card>
            </v-col>

            <v-col v-if="auth.isAuthenticated" cols="12" md="6">
                <v-card>
                    <v-card-title>Mes comptes</v-card-title>
                    <v-card-subtitle>Façons de se connecter</v-card-subtitle>
                    <v-card-text>
                        <div
                            v-for="account in linkedAccounts"
                            :key="account.key"
                            class="d-flex align-center ga-3 mb-2"
                        >
                            <v-icon :icon="account.icon" size="20" />
                            <div class="flex-grow-1">
                                <div>{{ account.label }}</div>
                                <div class="text-caption text-medium-emphasis">
                                    {{ account.identity?.subject ?? 'Non lié' }}
                                </div>
                            </div>
                            <v-icon v-if="account.identity" color="success" size="20">
                                mdi-check-circle
                            </v-icon>
                            <v-btn
                                v-else-if="account.key === 'iut'"
                                :href="linkIutUrl()"
                                color="primary"
                                variant="tonal"
                                size="small"
                            >
                                Lier
                            </v-btn>
                        </div>
                        <div class="text-caption text-medium-emphasis mt-3">
                            Lier votre compte {{ providers.iutLabel }} vous permet de vous connecter
                            avec l'un ou l'autre, sans créer un second compte.
                        </div>
                    </v-card-text>
                </v-card>
            </v-col>

            <!-- Hidden outright only where nothing would help: a browser
                 without push, or a deployment with no keypair. On iOS the card
                 still renders, as an invitation to install. -->
            <v-col v-if="reminders.shown" cols="12" md="6">
                <ReminderSettingsCard />
            </v-col>

            <v-col cols="12" md="6">
                <v-card>
                    <v-card-title>Cours masqués</v-card-title>
                    <v-card-subtitle>Retirés de votre planning, sur ce navigateur</v-card-subtitle>
                    <v-card-text>
                        <v-autocomplete
                            :model-value="hiddenCourses.titles"
                            :items="titleChoices"
                            label="Masquer un cours"
                            multiple
                            chips
                            closable-chips
                            clearable
                            variant="outlined"
                            density="compact"
                            hide-details
                            class="mb-3"
                            @update:model-value="hiddenCourses.set"
                        />
                        <div class="text-caption text-medium-emphasis">
                            Un cours masqué disparaît de votre planning, de l'accueil et des
                            rappels. «&nbsp;Anglais&nbsp;» et «&nbsp;Anglais - Test&nbsp;» sont deux
                            cours distincts.
                        </div>
                    </v-card-text>
                </v-card>
            </v-col>

            <v-col v-if="!groups.usesAccountGroup" cols="12" md="6">
                <v-card>
                    <v-card-title>Mes groupes</v-card-title>
                    <v-card-subtitle>Choix local, sans compte</v-card-subtitle>
                    <v-card-text>
                        <v-chip v-for="id in groups.selectedGroupIds" :key="id" class="mr-2 mb-2">
                            {{ groupLabelById(id) }}
                        </v-chip>
                        <div
                            v-if="groups.selectedGroupIds.length === 0"
                            class="text-medium-emphasis"
                        >
                            Aucun groupe sélectionné
                        </div>
                    </v-card-text>
                    <v-card-actions>
                        <v-btn
                            color="primary"
                            variant="flat"
                            prepend-icon="mdi-pencil"
                            @click="pickerOpen = true"
                        >
                            Changer
                        </v-btn>
                    </v-card-actions>
                </v-card>
            </v-col>
        </v-row>
    </v-container>

    <GroupPickerDialog v-model="pickerOpen" />
</template>
