<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import type { AuthUser } from '../../stores/auth.js'
import { useGroupsStore } from '../../stores/groups.js'
import { useNotificationsStore } from '../../stores/notifications.js'

const groups = useGroupsStore()
const notifs = useNotificationsStore()

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

const users = ref<AuthUser[]>([])
const loading = ref(false)
const saving = ref<string | null>(null)

async function fetchUsers() {
  loading.value = true
  try {
    const res = await fetch(`${API_URL}/api/admin/users`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
    })
    const body = await res.json() as { data: AuthUser[] }
    users.value = body.data
  } finally {
    loading.value = false
  }
}

const pending = computed(() => users.value.filter(u => u.status === 'pending'))
const others = computed(() => users.value.filter(u => u.status !== 'pending'))

async function updateUser(id: string, patch: Partial<AuthUser>) {
  saving.value = id
  try {
    const res = await fetch(`${API_URL}/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
      },
      body: JSON.stringify(patch),
    })
    if (!res.ok) throw new Error('update failed')
    const body = await res.json() as { data: AuthUser }
    const idx = users.value.findIndex(u => u.id === id)
    if (idx >= 0) users.value[idx] = body.data
    notifs.success('Utilisateur mis à jour')
  } catch {
    notifs.error('Erreur lors de la mise à jour')
  } finally {
    saving.value = null
  }
}

async function approve(user: AuthUser, role: 'student' | 'teacher') {
  await updateUser(user.id, { status: 'approved', role })
}

async function reject(user: AuthUser) {
  await updateUser(user.id, { status: 'rejected' })
}

const statusColor: Record<string, string> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'error',
}

const statusLabel: Record<string, string> = {
  pending: 'En attente',
  approved: 'Approuvé',
  rejected: 'Refusé',
}

function groupName(id: string | null) {
  if (!id) return '—'
  return groups.allGroups.find(g => g.id === id)?.internalName ?? id
}

onMounted(fetchUsers)
</script>

<template>
  <v-container>
    <div class="text-h6 mb-4">Gestion des utilisateurs</div>

    <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-4" />

    <div v-if="pending.length > 0" class="mb-6">
      <div class="text-subtitle-2 text-warning mb-2">
        <v-icon size="16" color="warning">mdi-clock-outline</v-icon>
        En attente ({{ pending.length }})
      </div>
      <v-card v-for="user in pending" :key="user.id" variant="outlined" class="mb-2">
        <v-card-text class="d-flex align-center gap-3 flex-wrap pa-3">
          <v-avatar size="36" :image="user.discordAvatar ? `https://cdn.discordapp.com/avatars/${user.discordId}/${user.discordAvatar}.png` : undefined">
            <v-icon v-if="!user.discordAvatar">mdi-account</v-icon>
          </v-avatar>
          <div class="flex-grow-1">
            <div class="font-weight-medium">{{ user.discordUsername }}</div>
            <div class="text-caption text-medium-emphasis">{{ user.discordId }}</div>
          </div>
          <v-btn
            size="small"
            color="success"
            variant="tonal"
            :loading="saving === user.id"
            @click="approve(user, 'student')"
          >
            Élève
          </v-btn>
          <v-btn
            size="small"
            color="primary"
            variant="tonal"
            :loading="saving === user.id"
            @click="approve(user, 'teacher')"
          >
            Prof
          </v-btn>
          <v-btn
            size="small"
            color="error"
            variant="text"
            :loading="saving === user.id"
            @click="reject(user)"
          >
            Refuser
          </v-btn>
        </v-card-text>
      </v-card>
    </div>

    <v-table density="compact">
      <thead>
        <tr>
          <th>Utilisateur</th>
          <th>Rôle</th>
          <th>Groupe</th>
          <th>Statut</th>
          <th>Admin</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="user in others" :key="user.id">
          <td>
            <div class="d-flex align-center gap-2 py-1">
              <v-avatar size="28" :image="user.discordAvatar ? `https://cdn.discordapp.com/avatars/${user.discordId}/${user.discordAvatar}.png` : undefined">
                <v-icon v-if="!user.discordAvatar" size="16">mdi-account</v-icon>
              </v-avatar>
              {{ user.discordUsername }}
            </div>
          </td>
          <td>{{ user.role ?? '—' }}</td>
          <td>{{ groupName(user.studentGroupId) }}</td>
          <td>
            <v-chip :color="statusColor[user.status]" size="x-small" label>
              {{ statusLabel[user.status] }}
            </v-chip>
          </td>
          <td>
            <v-checkbox-btn
              :model-value="user.isAdmin"
              density="compact"
              :loading="saving === user.id"
              @update:model-value="updateUser(user.id, { isAdmin: $event })"
            />
          </td>
          <td>
            <v-btn
              v-if="user.status === 'rejected'"
              size="x-small"
              variant="text"
              color="success"
              :loading="saving === user.id"
              @click="approve(user, user.role ?? 'student')"
            >
              Réactiver
            </v-btn>
          </td>
        </tr>
      </tbody>
    </v-table>
  </v-container>
</template>
