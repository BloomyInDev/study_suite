<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { API_URL } from '../../lib/api-url'
import { groupLabel } from '../../lib/group-label.js'
import { useGroupsStore } from '../../stores/groups.js'
import { useNotificationsStore } from '../../stores/notifications.js'
import { useProvidersStore } from '../../stores/providers.js'

interface IutMapping {
    id: string
    claimValue: string
    userRole: 'student' | 'teacher'
    studentGroupId: string | null
    studentGroupName: string | null
    createdAt: string
}

const groups = useGroupsStore()
const notifs = useNotificationsStore()
const providers = useProvidersStore()

const mappings = ref<IutMapping[]>([])
const loading = ref(false)
const saving = ref(false)
const deleting = ref<string | null>(null)

const form = reactive({
    claimValue: '',
    userRole: 'student' as 'student' | 'teacher',
    studentGroupId: null as string | null,
})

const groupChoices = computed(() =>
    groups.allGroups.map((g) => ({ title: groupLabel(g), value: g.id })),
)

const canSubmit = computed(
    () =>
        form.claimValue.trim().length > 0 && (form.userRole === 'teacher' || !!form.studentGroupId),
)

function authHeaders() {
    return { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
}

async function fetchMappings() {
    loading.value = true
    try {
        const res = await fetch(`${API_URL}/api/admin/iut-mappings`, { headers: authHeaders() })
        if (!res.ok) {
            notifs.error('Impossible de charger les liaisons')
            return
        }
        mappings.value = ((await res.json()) as { data: IutMapping[] }).data
    } finally {
        loading.value = false
    }
}

async function createMapping() {
    saving.value = true
    try {
        const res = await fetch(`${API_URL}/api/admin/iut-mappings`, {
            method: 'POST',
            headers: { ...authHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({
                claimValue: form.claimValue.trim(),
                userRole: form.userRole,
                ...(form.userRole === 'student' ? { studentGroupId: form.studentGroupId } : {}),
            }),
        })
        if (!res.ok) {
            notifs.error(
                res.status === 409 ? 'Ce groupe est déjà lié' : 'Impossible de créer la liaison',
            )
            return
        }
        form.claimValue = ''
        form.studentGroupId = null
        notifs.success('Liaison créée')
        await fetchMappings()
    } finally {
        saving.value = false
    }
}

async function removeMapping(id: string) {
    deleting.value = id
    try {
        const res = await fetch(`${API_URL}/api/admin/iut-mappings/${id}`, {
            method: 'DELETE',
            headers: authHeaders(),
        })
        if (!res.ok) {
            notifs.error('Impossible de supprimer la liaison')
            return
        }
        await fetchMappings()
    } finally {
        deleting.value = null
    }
}

onMounted(() => {
    void fetchMappings()
    void groups.fetchAll()
})
</script>

<template>
    <v-container>
        <div class="text-h6 mb-1">Liaisons {{ providers.iutLabel }}</div>
        <div class="text-body-2 text-medium-emphasis mb-4">
            L'annuaire LDAP renvoie la population et l'année (<code>etudiants</code>,
            <code>ann3</code>), pas le groupe de TD. La classe indiquée ici sert de point de
            départ&nbsp;: l'étudiant précise ensuite son sous-groupe depuis son profil.
        </div>

        <v-card variant="outlined" class="mb-6">
            <v-card-text class="d-flex ga-3 flex-wrap align-start">
                <v-text-field
                    v-model="form.claimValue"
                    label="Groupe de l'annuaire"
                    placeholder="ann3"
                    density="compact"
                    variant="outlined"
                    hide-details
                    style="min-width: 200px"
                />
                <v-select
                    v-model="form.userRole"
                    :items="[
                        { title: 'Étudiant', value: 'student' },
                        { title: 'Enseignant', value: 'teacher' },
                    ]"
                    label="Rôle"
                    density="compact"
                    variant="outlined"
                    hide-details
                    style="min-width: 160px"
                />
                <v-select
                    v-if="form.userRole === 'student'"
                    v-model="form.studentGroupId"
                    :items="groupChoices"
                    label="Classe"
                    density="compact"
                    variant="outlined"
                    hide-details
                    style="min-width: 220px"
                />
                <v-btn
                    color="primary"
                    variant="flat"
                    :loading="saving"
                    :disabled="!canSubmit"
                    @click="createMapping"
                >
                    Ajouter
                </v-btn>
            </v-card-text>
        </v-card>

        <v-progress-linear v-if="loading" indeterminate class="mb-3" />

        <div v-if="!loading && mappings.length === 0" class="text-medium-emphasis">
            Aucune liaison. Sans liaison, une connexion {{ providers.iutLabel }} crée un compte en
            attente de validation.
        </div>

        <v-table v-else-if="mappings.length > 0" density="compact">
            <thead>
                <tr>
                    <th>Groupe</th>
                    <th>Rôle</th>
                    <th>Classe</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="mapping in mappings" :key="mapping.id">
                    <td>
                        <code>{{ mapping.claimValue }}</code>
                    </td>
                    <td>{{ mapping.userRole === 'teacher' ? 'Enseignant' : 'Étudiant' }}</td>
                    <td>{{ mapping.studentGroupName ?? '—' }}</td>
                    <td class="text-right">
                        <v-btn
                            icon="mdi-delete"
                            size="x-small"
                            variant="text"
                            color="error"
                            :loading="deleting === mapping.id"
                            @click="removeMapping(mapping.id)"
                        />
                    </td>
                </tr>
            </tbody>
        </v-table>
    </v-container>
</template>
