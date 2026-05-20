<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useGroupsStore } from '../../stores/groups.js'
import { useNotificationsStore } from '../../stores/notifications.js'

interface RoleMapping {
  id: string
  guildId: string
  discordRoleId: string
  studentGroupId: string
  studentGroupName: string | null
  createdAt: string
}

interface Guild {
  id: string
  discordGuildId: string
  name: string
  createdAt: string
  mappings: RoleMapping[]
}

const groups = useGroupsStore()
const notifs = useNotificationsStore()

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

const guilds = ref<Guild[]>([])
const loading = ref(false)

// Add guild dialog
const guildDialog = ref(false)
const savingGuild = ref(false)
const guildForm = ref({ discordGuildId: '', name: '' })

// Add mapping dialog
const mappingDialog = ref(false)
const savingMapping = ref(false)
const mappingTarget = ref<Guild | null>(null)
const mappingForm = ref({ discordRoleId: '', studentGroupId: '' })

// Deletion state
const deletingGuild = ref<string | null>(null)
const deletingMapping = ref<string | null>(null)

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
}

async function fetchGuilds() {
  loading.value = true
  try {
    const res = await fetch(`${API_URL}/api/admin/guilds`, { headers: authHeaders() })
    const body = await res.json() as { data: Guild[] }
    guilds.value = body.data
  } finally {
    loading.value = false
  }
}

async function addGuild() {
  savingGuild.value = true
  try {
    const res = await fetch(`${API_URL}/api/admin/guilds`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(guildForm.value),
    })
    if (!res.ok) throw new Error()
    const body = await res.json() as { data: Guild }
    guilds.value.push(body.data)
    notifs.success('Serveur ajouté')
    guildDialog.value = false
    guildForm.value = { discordGuildId: '', name: '' }
  } catch {
    notifs.error('Erreur lors de l\'ajout du serveur')
  } finally {
    savingGuild.value = false
  }
}

async function deleteGuild(guild: Guild) {
  deletingGuild.value = guild.id
  try {
    await fetch(`${API_URL}/api/admin/guilds/${guild.id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    })
    guilds.value = guilds.value.filter(g => g.id !== guild.id)
    notifs.success('Serveur supprimé')
  } catch {
    notifs.error('Erreur lors de la suppression')
  } finally {
    deletingGuild.value = null
  }
}

function openMappingDialog(guild: Guild) {
  mappingTarget.value = guild
  mappingForm.value = { discordRoleId: '', studentGroupId: '' }
  mappingDialog.value = true
}

async function addMapping() {
  if (!mappingTarget.value) return
  savingMapping.value = true
  try {
    const res = await fetch(`${API_URL}/api/admin/guilds/${mappingTarget.value.id}/mappings`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(mappingForm.value),
    })
    if (!res.ok) throw new Error()
    const body = await res.json() as { data: RoleMapping }
    const guild = guilds.value.find(g => g.id === mappingTarget.value!.id)
    if (guild) {
      const group = groups.allGroups.find(g => g.id === mappingForm.value.studentGroupId)
      guild.mappings.push({ ...body.data, studentGroupName: group?.internalName ?? null })
    }
    notifs.success('Liaison ajoutée')
    mappingDialog.value = false
  } catch {
    notifs.error('Erreur lors de l\'ajout de la liaison')
  } finally {
    savingMapping.value = false
  }
}

async function deleteMapping(guild: Guild, mapping: RoleMapping) {
  deletingMapping.value = mapping.id
  try {
    await fetch(`${API_URL}/api/admin/guilds/${guild.id}/mappings/${mapping.id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    })
    guild.mappings = guild.mappings.filter(m => m.id !== mapping.id)
    notifs.success('Liaison supprimée')
  } catch {
    notifs.error('Erreur lors de la suppression')
  } finally {
    deletingMapping.value = null
  }
}

onMounted(fetchGuilds)
</script>

<template>
  <v-container>
    <div class="d-flex align-center justify-space-between mb-2">
      <div class="text-h6">Serveurs Discord</div>
      <v-btn color="primary" prepend-icon="mdi-plus" size="small" @click="guildDialog = true">
        Ajouter un serveur
      </v-btn>
    </div>
    <p class="text-body-2 text-medium-emphasis mb-4">
      Les utilisateurs ayant un rôle Discord lié à une classe sont automatiquement approuvés comme élèves.
    </p>

    <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-4" />

    <div v-if="guilds.length === 0 && !loading" class="text-center text-medium-emphasis py-8">
      Aucun serveur configuré
    </div>

    <v-card
      v-for="guild in guilds"
      :key="guild.id"
      class="mb-4"
      variant="outlined"
    >
      <v-card-title class="d-flex align-center justify-space-between pa-4">
        <div class="d-flex align-center gap-2">
          <v-icon color="indigo">mdi-discord</v-icon>
          <span>{{ guild.name }}</span>
          <v-chip size="x-small" label class="ml-1 text-caption text-medium-emphasis">
            {{ guild.discordGuildId }}
          </v-chip>
        </div>
        <div class="d-flex gap-2">
          <v-btn
            size="small"
            variant="tonal"
            prepend-icon="mdi-link-plus"
            @click="openMappingDialog(guild)"
          >
            Ajouter liaison
          </v-btn>
          <v-btn
            icon="mdi-delete"
            size="small"
            variant="text"
            color="error"
            :loading="deletingGuild === guild.id"
            @click="deleteGuild(guild)"
          />
        </div>
      </v-card-title>

      <v-divider v-if="guild.mappings.length > 0" />

      <v-list v-if="guild.mappings.length > 0" density="compact">
        <v-list-item
          v-for="mapping in guild.mappings"
          :key="mapping.id"
        >
          <template #prepend>
            <v-icon size="16" color="medium-emphasis">mdi-arrow-right</v-icon>
          </template>
          <v-list-item-title class="text-body-2">
            Rôle <code class="text-caption bg-surface-variant px-1 rounded">{{ mapping.discordRoleId }}</code>
            → <strong>{{ mapping.studentGroupName ?? mapping.studentGroupId }}</strong>
          </v-list-item-title>
          <template #append>
            <v-btn
              icon="mdi-delete"
              size="x-small"
              variant="text"
              color="error"
              :loading="deletingMapping === mapping.id"
              @click="deleteMapping(guild, mapping)"
            />
          </template>
        </v-list-item>
      </v-list>

      <v-card-text v-else class="text-caption text-medium-emphasis py-2">
        Aucune liaison — cliquez sur « Ajouter liaison » pour en créer une.
      </v-card-text>
    </v-card>

    <!-- Add guild dialog -->
    <v-dialog v-model="guildDialog" max-width="440">
      <v-card>
        <v-card-title class="pt-4 px-4">Ajouter un serveur Discord</v-card-title>
        <v-card-text class="pa-4">
          <v-text-field
            v-model="guildForm.name"
            label="Nom du serveur"
            variant="outlined"
            density="compact"
            class="mb-3"
            placeholder="Ex: BTS SIO 2024"
          />
          <v-text-field
            v-model="guildForm.discordGuildId"
            label="ID du serveur Discord"
            variant="outlined"
            density="compact"
            hint="Activez le mode développeur Discord → clic droit sur le serveur → Copier l'identifiant"
            persistent-hint
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="guildDialog = false">Annuler</v-btn>
          <v-btn
            color="primary"
            variant="flat"
            :loading="savingGuild"
            :disabled="!guildForm.name || !guildForm.discordGuildId"
            @click="addGuild"
          >
            Ajouter
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Add mapping dialog -->
    <v-dialog v-model="mappingDialog" max-width="440">
      <v-card>
        <v-card-title class="pt-4 px-4">
          Nouvelle liaison
          <span v-if="mappingTarget" class="text-body-2 font-weight-regular text-medium-emphasis ml-1">
            ({{ mappingTarget.name }})
          </span>
        </v-card-title>
        <v-card-text class="pa-4">
          <v-text-field
            v-model="mappingForm.discordRoleId"
            label="ID du rôle Discord"
            variant="outlined"
            density="compact"
            class="mb-3"
            hint="Mode développeur Discord → clic droit sur le rôle → Copier l'identifiant"
            persistent-hint
          />
          <v-select
            v-model="mappingForm.studentGroupId"
            :items="groups.allGroups"
            item-title="internalName"
            item-value="id"
            label="Classe"
            variant="outlined"
            density="compact"
            class="mt-3"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="mappingDialog = false">Annuler</v-btn>
          <v-btn
            color="primary"
            variant="flat"
            :loading="savingMapping"
            :disabled="!mappingForm.discordRoleId || !mappingForm.studentGroupId"
            @click="addMapping"
          >
            Créer
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>
