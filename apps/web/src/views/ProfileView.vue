<script setup lang="ts">
import { groupLabel } from '../lib/group-label.js'
import { computed, ref } from 'vue'
import GroupPickerDialog from '../components/GroupPickerDialog.vue'
import { API_URL } from '../lib/api-url'
import { useAuthStore } from '../stores/auth.js'
import { useGroupsStore } from '../stores/groups.js'
import { useNotificationsStore } from '../stores/notifications.js'

const groups = useGroupsStore()
const auth = useAuthStore()
const notifs = useNotificationsStore()
const pickerOpen = ref(false)
const savingGroup = ref(false)
const classDraft = ref<string | null>(auth.user?.studentGroupId ?? null)

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

const PROVIDERS = [
    { key: 'discord' as const, label: 'Discord', icon: 'fa:fab fa-discord' },
    { key: 'iut' as const, label: 'IUT', icon: 'mdi-school' },
]

const linkedAccounts = computed(() =>
    PROVIDERS.map((p) => ({
        ...p,
        identity: auth.user?.identities.find((i) => i.provider === p.key) ?? null,
    })),
)

/**
 * The link flow is a redirect, so the app token cannot ride in a header — it
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
                            Lier votre compte IUT vous permet de vous connecter avec l'un ou
                            l'autre, sans créer un second compte.
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
