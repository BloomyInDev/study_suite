<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { backend } from '../lib/api.js'
import { groupLabel } from '../lib/group-label.js'
import type { Group, GroupRef } from '../lib/types.js'
import { useGroupsStore } from '../stores/groups.js'
import { useNotificationsStore } from '../stores/notifications.js'

const groupsStore = useGroupsStore()
const notifs = useNotificationsStore()

const search = ref('')
const displayNameDraft = ref('')
const dialogOpen = ref(false)
const dialogGroup = ref<Group | null>(null)
const addParentIds = ref<string[]>([])
const saving = ref(false)

const filtered = computed(() => {
    const q = search.value.trim().toLowerCase()
    return q
        ? groupsStore.allGroups.filter((g) => g.internalName.toLowerCase().includes(q))
        : groupsStore.allGroups
})

const addableParents = computed(() => {
    if (!dialogGroup.value) return []
    const currentParentIds = new Set(dialogGroup.value.parents?.map((p) => p.id) ?? [])
    return groupsStore.allGroups.filter(
        (g) => g.id !== dialogGroup.value!.id && !currentParentIds.has(g.id),
    )
})

// The admin view is the one place hidden groups must stay visible.
onMounted(() => groupsStore.fetchAll(true))

async function saveDetails() {
    if (!dialogGroup.value) return
    const name = displayNameDraft.value.trim()
    saving.value = true
    try {
        await backend.api.groups[':id'].$patch({
            param: { id: dialogGroup.value.id },
            json: { displayName: name === '' ? null : name, hidden: dialogGroup.value.hidden },
        })
        await groupsStore.fetchAll(true)
        dialogGroup.value =
            groupsStore.allGroups.find((g) => g.id === dialogGroup.value!.id) ?? null
        notifs.success('Groupe mis à jour')
    } catch {
        notifs.error('Impossible de mettre à jour le groupe')
    } finally {
        saving.value = false
    }
}

function openDialog(group: Group) {
    displayNameDraft.value = group.displayName ?? ''
    dialogGroup.value = {
        ...group,
        parents: [...(group.parents ?? [])],
        children: [...(group.children ?? [])],
    }
    addParentIds.value = []
    dialogOpen.value = true
}

async function addParent() {
    if (!dialogGroup.value || addParentIds.value.length === 0) return
    saving.value = true
    try {
        await Promise.all(
            addParentIds.value.map((parentId) =>
                backend.api.groups[':id'].parents.$post({
                    param: { id: dialogGroup.value!.id },
                    json: { parentId },
                }),
            ),
        )
        await groupsStore.fetchAll(true)
        dialogGroup.value =
            groupsStore.allGroups.find((g) => g.id === dialogGroup.value!.id) ?? null
        addParentIds.value = []
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
        await groupsStore.fetchAll(true)
        dialogGroup.value =
            groupsStore.allGroups.find((g) => g.id === dialogGroup.value!.id) ?? null
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
                        {{ groupLabel(group) }}
                        <span
                            v-if="group.displayName"
                            class="text-caption text-medium-emphasis font-weight-regular ml-1"
                            >({{ group.internalName }})</span
                        >
                        <v-chip v-if="group.hidden" size="x-small" class="ml-2" variant="tonal">
                            <v-icon icon="mdi-eye-off-outline" start size="x-small" />Masqué
                        </v-chip>
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
                                >{{ p.internalName }}</v-chip
                            >
                        </template>
                        <span v-else class="text-caption text-medium-emphasis">Groupe racine</span>
                    </v-list-item-subtitle>
                    <template #append>
                        <v-icon icon="mdi-pencil-outline" size="small" color="medium-emphasis" />
                    </template>
                </v-list-item>
            </template>
            <v-list-item v-if="filtered.length === 0">
                <v-list-item-title class="text-medium-emphasis"
                    >Aucun groupe trouvé.</v-list-item-title
                >
            </v-list-item>
        </v-list>

        <!-- Edit dialog -->
        <v-dialog v-model="dialogOpen" max-width="520">
            <v-card v-if="dialogGroup">
                <v-card-title class="text-h6 pt-4 px-4">
                    {{ dialogGroup.internalName }}
                    <v-btn
                        icon="mdi-close"
                        variant="text"
                        size="small"
                        class="float-right"
                        @click="dialogOpen = false"
                    />
                </v-card-title>

                <v-card-text class="pa-4">
                    <v-text-field
                        v-model="displayNameDraft"
                        label="Nom affiché"
                        :placeholder="dialogGroup.internalName"
                        persistent-placeholder
                        variant="outlined"
                        density="compact"
                        hide-details
                        clearable
                        class="mb-3"
                    />
                    <v-switch
                        v-model="dialogGroup.hidden"
                        label="Masquer ce groupe"
                        color="primary"
                        density="compact"
                        hide-details
                        class="mb-1"
                    />
                    <div class="text-caption text-medium-emphasis mb-3">
                        Un groupe masqué reste lié aux évènements mais disparaît des listes et des
                        sélecteurs.
                    </div>
                    <v-btn
                        :loading="saving"
                        color="primary"
                        variant="flat"
                        size="small"
                        class="mb-4"
                        @click="saveDetails"
                        >Enregistrer</v-btn
                    >
                    <v-divider class="mb-4" />
                    <!-- Current parents -->
                    <div class="mb-4">
                        <p class="text-body-2 font-weight-medium mb-2">Groupes parents directs</p>
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
                            v-model="addParentIds"
                            :items="addableParents"
                            item-title="internalName"
                            item-value="id"
                            label="Groupes parents"
                            variant="outlined"
                            density="compact"
                            hide-details
                            clearable
                            multiple
                            chips
                            closable-chips
                            class="flex-grow-1"
                        />
                        <v-btn
                            color="primary"
                            variant="flat"
                            :disabled="addParentIds.length === 0 || saving"
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
