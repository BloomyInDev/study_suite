<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useGroupsStore } from '../../stores/groups.js'
import { useNotificationsStore } from '../../stores/notifications.js'

interface Mapping {
  id: string
  discordGuildId: string
  discordRoleId: string
  studentGroupId: string
  studentGroupName: string | null
  createdAt: string
}

const groups = useGroupsStore()
const notifs = useNotificationsStore()

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

const mappings = ref<Mapping[]>([])
const loading = ref(false)
const deleting = ref<string | null>(null)
const dialogOpen = ref(false)
const saving = ref(false)

const form = ref({
  discordGuildId: '',
  discordRoleId: '',
  studentGroupId: '',
})

function authHeaders() {
  return {
    Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
  }
}

async function fetchMappings() {
  loading.value = true
  try {
    const res = await fetch(`${API_URL}/api/admin/discord-mappings`, { headers: authHeaders() })
    const body = await res.json() as { data: Mapping[] }
    mappings.value = body.data
  } finally {
    loading.value = false
  }
}

async function createMapping() {
  saving.value = true
  try {
    const res = await fetch(`${API_URL}/api/admin/discord-mappings`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(form.value),
    })
    if (!res.ok) throw new Error('create failed')
    notifs.success('Liaison créée')
    dialogOpen.value = false
    form.value = { discordGuildId: '', discordRoleId: '', studentGroupId: '' }
    await fetchMappings()
  } catch {
    notifs.error('Erreur lors de la création')
  } finally {
    saving.value = false
  }
}

async function deleteMapping(id: string) {
  deleting.value = id
  try {
    await fetch(`${API_URL}/api/admin/discord-mappings/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    })
    mappings.value = mappings.value.filter(m => m.id !== id)
    notifs.success('Liaison supprimée')
  } catch {
    notifs.error('Erreur lors de la suppression')
  } finally {
    deleting.value = null
  }
}

onMounted(fetchMappings)
</script>

<template>
  <v-container>
    <div class="d-flex align-center justify-space-between mb-4">
      <div class="text-h6">Liaisons Discord → Classe</div>
      <v-btn color="primary" prepend-icon="mdi-plus" @click="dialogOpen = true">Ajouter</v-btn>
    </div>

    <p class="text-body-2 text-medium-emphasis mb-4">
      Associez un rôle Discord à une classe. Les utilisateurs ayant ce rôle seront automatiquement approuvés comme élèves de cette classe.
    </p>

    <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-4" />

    <v-table density="compact">
      <thead>
        <tr>
          <th>ID Serveur Discord</th>
          <th>ID Rôle Discord</th>
          <th>Classe</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="mappings.length === 0">
          <td colspan="4" class="text-center text-medium-emphasis py-4">
            Aucune liaison configurée
          </td>
        </tr>
        <tr v-for="m in mappings" :key="m.id">
          <td class="text-caption">{{ m.discordGuildId }}</td>
          <td class="text-caption">{{ m.discordRoleId }}</td>
          <td>{{ m.studentGroupName ?? m.studentGroupId }}</td>
          <td>
            <v-btn
              icon="mdi-delete"
              size="x-small"
              variant="text"
              color="error"
              :loading="deleting === m.id"
              @click="deleteMapping(m.id)"
            />
          </td>
        </tr>
      </tbody>
    </v-table>

    <v-dialog v-model="dialogOpen" max-width="480">
      <v-card>
        <v-card-title class="pt-4 px-4">Nouvelle liaison</v-card-title>
        <v-card-text class="pa-4">
          <v-text-field
            v-model="form.discordGuildId"
            label="ID du serveur Discord"
            variant="outlined"
            density="compact"
            class="mb-3"
            hint="Activez le mode développeur Discord pour copier l'ID"
          />
          <v-text-field
            v-model="form.discordRoleId"
            label="ID du rôle Discord"
            variant="outlined"
            density="compact"
            class="mb-3"
          />
          <v-select
            v-model="form.studentGroupId"
            :items="groups.allGroups"
            item-title="internalName"
            item-value="id"
            label="Classe"
            variant="outlined"
            density="compact"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="dialogOpen = false">Annuler</v-btn>
          <v-btn
            color="primary"
            variant="flat"
            :loading="saving"
            :disabled="!form.discordGuildId || !form.discordRoleId || !form.studentGroupId"
            @click="createMapping"
          >
            Créer
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>
