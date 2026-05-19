<script setup lang="ts">
import { computed, ref } from 'vue'
import { backend } from '../lib/api.js'
import type { Group, GroupRef } from '../lib/types.js'
import { useGroupsStore } from '../stores/groups.js'
import { useNotificationsStore } from '../stores/notifications.js'

const groupsStore = useGroupsStore()
const notifs = useNotificationsStore()

const search = ref('')
const dialogOpen = ref(false)
const dialogGroup = ref<Group | null>(null)
const addParentId = ref<string | null>(null)
const saving = ref(false)

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return q
    ? groupsStore.allGroups.filter(g => g.internalName.toLowerCase().includes(q))
    : groupsStore.allGroups
})

const addableParents = computed(() => {
  if (!dialogGroup.value) return []
  const currentParentIds = new Set(dialogGroup.value.parents?.map(p => p.id) ?? [])
  return groupsStore.allGroups.filter(
    g => g.id !== dialogGroup.value!.id && !currentParentIds.has(g.id),
  )
})

function openDialog(group: Group) {
  dialogGroup.value = { ...group, parents: [...(group.parents ?? [])], children: [...(group.children ?? [])] }
  addParentId.value = null
  dialogOpen.value = true
}

async function addParent() {
  if (!dialogGroup.value || !addParentId.value) return
  saving.value = true
  try {
    const res = await backend.api.groups[':id'].parents.$post({
      param: { id: dialogGroup.value.id },
      json: { parentId: addParentId.value },
    })
    if (!res.ok) {
      const json = await res.json() as any
      notifs.error(json?.error?.message ?? 'Erreur')
      return
    }
    await groupsStore.fetchAll()
    // refresh dialog data from updated store
    dialogGroup.value = groupsStore.allGroups.find(g => g.id === dialogGroup.value!.id) ?? null
    addParentId.value = null
  } finally {
    saving.value = false
  }
}

async function removeParent(parent: GroupRef) {
  if (!dialogGroup.value) return
  saving.value = true
  try {
    await backend.api.groups[':id'].parents[':parentId'].$delete({
      param: { id: dialogGroup.value.id, parentId: parent.id },
    })
    await groupsStore.fetchAll()
    dialogGroup.value = groupsStore.allGroups.find(g => g.id === dialogGroup.value!.id) ?? null
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <v-container fluid class="pa-4">
    <v-row class="mb-4" align="center">
      <v-col cols="12" md="6">
        <v-text-field
          v-model="search"
          prepend-inner-icon="mdi-magnify"
          label="Rechercher un groupe"
          variant="outlined"
          density="compact"
          hide-details
          clearable
        />
      </v-col>
      <v-col cols="12" md="6" class="text-medium-emphasis text-body-2">
        {{ groupsStore.allGroups.length }} groupes au total
      </v-col>
    </v-row>

    <v-list lines="two" border rounded>
      <template v-for="(group, i) in filtered" :key="group.id">
        <v-divider v-if="i > 0" />
        <v-list-item @click="openDialog(group)" link>
          <v-list-item-title class="font-weight-medium">
            {{ group.internalName }}
          </v-list-item-title>
          <v-list-item-subtitle>
            <template v-if="group.parents?.length">
              <span class="mr-1 text-caption text-medium-emphasis">Parents :</span>
              <v-chip
                v-for="p in group.parents"
                :key="p.id"
                size="x-small"
                class="mr-1"
                variant="tonal"
              >{{ p.internalName }}</v-chip>
            </template>
            <span v-else class="text-caption text-medium-emphasis">Groupe racine</span>
          </v-list-item-subtitle>
          <template #append>
            <v-icon icon="mdi-pencil-outline" size="small" color="medium-emphasis" />
          </template>
        </v-list-item>
      </template>
      <v-list-item v-if="filtered.length === 0">
        <v-list-item-title class="text-medium-emphasis">Aucun groupe trouvé.</v-list-item-title>
      </v-list-item>
    </v-list>

    <!-- Edit dialog -->
    <v-dialog v-model="dialogOpen" max-width="520">
      <v-card v-if="dialogGroup">
        <v-card-title class="text-h6 pt-4 px-4">
          {{ dialogGroup.internalName }}
          <v-btn icon="mdi-close" variant="text" size="small" class="float-right" @click="dialogOpen = false" />
        </v-card-title>

        <v-card-text class="pa-4">
          <!-- Current parents -->
          <div class="mb-4">
            <p class="text-body-2 font-weight-medium mb-2">
              Groupes parents directs
            </p>
            <div v-if="dialogGroup.parents?.length" class="d-flex flex-wrap ga-2">
              <v-chip
                v-for="parent in dialogGroup.parents"
                :key="parent.id"
                closable
                :disabled="saving"
                @click:close="removeParent(parent)"
              >
                {{ parent.internalName }}
              </v-chip>
            </div>
            <p v-else class="text-medium-emphasis text-body-2">
              Aucun parent — groupe racine.
            </p>
          </div>

          <v-divider class="mb-4" />

          <!-- Add parent -->
          <p class="text-body-2 font-weight-medium mb-2">Ajouter un parent</p>
          <div class="d-flex ga-2 align-center">
            <v-autocomplete
              v-model="addParentId"
              :items="addableParents"
              item-title="internalName"
              item-value="id"
              label="Groupe parent"
              variant="outlined"
              density="compact"
              hide-details
              clearable
              class="flex-grow-1"
            />
            <v-btn
              color="primary"
              variant="flat"
              :disabled="!addParentId || saving"
              :loading="saving"
              @click="addParent"
            >
              Ajouter
            </v-btn>
          </div>

          <!-- Children info (read-only) -->
          <template v-if="dialogGroup.children?.length">
            <v-divider class="my-4" />
            <p class="text-body-2 font-weight-medium mb-2">Groupes enfants directs</p>
            <div class="d-flex flex-wrap ga-2">
              <v-chip
                v-for="child in dialogGroup.children"
                :key="child.id"
                size="small"
                variant="tonal"
                color="primary"
              >
                {{ child.internalName }}
              </v-chip>
            </div>
          </template>
        </v-card-text>
      </v-card>
    </v-dialog>
  </v-container>
</template>
