<script setup lang="ts">
import { groupLabel } from '../../lib/group-label.js'
import { API_URL } from '../../lib/api-url'
import { ref, onMounted, computed } from 'vue'
import { useGroupsStore } from '../../stores/groups.js'
import { useNotificationsStore } from '../../stores/notifications.js'

interface RoleMapping {
    id: string
    guildId: string
    discordRoleId: string
    userRole: 'student' | 'teacher'
    studentGroupId: string | null
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

interface DiscordGuild {
    id: string
    name: string
    icon: string | null
}

const groups = useGroupsStore()
const notifs = useNotificationsStore()


const guilds = ref<Guild[]>([])
const loading = ref(false)

// My Discord guilds panel
const discordPanelOpen = ref(false)
const loadingDiscordGuilds = ref(false)
const myDiscordGuilds = ref<DiscordGuild[]>([])
const configuredGuildIds = computed(() => new Set(guilds.value.map((g) => g.discordGuildId)))

// Add guild dialog
const guildDialog = ref(false)
const savingGuild = ref(false)
const guildForm = ref({ discordGuildId: '', name: '' })

// Add mapping dialog
const mappingDialog = ref(false)
const savingMapping = ref(false)
const mappingTarget = ref<Guild | null>(null)
const mappingForm = ref<{
    discordRoleId: string
    userRole: 'student' | 'teacher'
    studentGroupId: string | null
}>({ discordRoleId: '', userRole: 'student', studentGroupId: null })

const deletingGuild = ref<string | null>(null)
const deletingMapping = ref<string | null>(null)

function authHeaders() {
    return { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
}

async function fetchGuilds() {
    loading.value = true
    try {
        const res = await fetch(`${API_URL}/api/admin/guilds`, { headers: authHeaders() })
        const body = (await res.json()) as { data: Guild[] }
        guilds.value = body.data
    } finally {
        loading.value = false
    }
}

async function fetchMyDiscordGuilds() {
    loadingDiscordGuilds.value = true
    myDiscordGuilds.value = []
    try {
        const res = await fetch(`${API_URL}/api/auth/discord/my-guilds`, { headers: authHeaders() })
        if (!res.ok) {
            const body = (await res.json()) as { error: { code: string } }
            if (body.error.code === 'TOKEN_EXPIRED' || body.error.code === 'NO_TOKEN') {
                notifs.error('Token Discord expiré — reconnectez-vous pour rafraîchir.')
            } else {
                notifs.error('Impossible de récupérer vos serveurs Discord.')
            }
            return
        }
        const body = (await res.json()) as { data: DiscordGuild[] }
        myDiscordGuilds.value = body.data
    } finally {
        loadingDiscordGuilds.value = false
    }
}

function openDiscordPanel() {
    discordPanelOpen.value = true
    fetchMyDiscordGuilds()
}

function prefillGuildForm(dGuild: DiscordGuild) {
    guildForm.value = { discordGuildId: dGuild.id, name: dGuild.name }
    discordPanelOpen.value = false
    guildDialog.value = true
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
        const body = (await res.json()) as { data: Guild }
        guilds.value.push(body.data)
        notifs.success('Serveur ajouté')
        guildDialog.value = false
        guildForm.value = { discordGuildId: '', name: '' }
    } catch {
        notifs.error("Erreur lors de l'ajout du serveur")
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
        guilds.value = guilds.value.filter((g) => g.id !== guild.id)
        notifs.success('Serveur supprimé')
    } catch {
        notifs.error('Erreur lors de la suppression')
    } finally {
        deletingGuild.value = null
    }
}

function openMappingDialog(guild: Guild) {
    mappingTarget.value = guild
    mappingForm.value = { discordRoleId: '', userRole: 'student', studentGroupId: null }
    mappingDialog.value = true
}

async function addMapping() {
    if (!mappingTarget.value) return
    savingMapping.value = true
    try {
        const res = await fetch(`${API_URL}/api/admin/guilds/${mappingTarget.value.id}/mappings`, {
            method: 'POST',
            headers: { ...authHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify(
                mappingForm.value.userRole === 'student'
                    ? {
                          discordRoleId: mappingForm.value.discordRoleId,
                          userRole: 'student',
                          studentGroupId: mappingForm.value.studentGroupId,
                      }
                    : {
                          discordRoleId: mappingForm.value.discordRoleId,
                          userRole: 'teacher',
                      },
            ),
        })
        if (!res.ok) throw new Error()
        const body = (await res.json()) as { data: RoleMapping }
        const guild = guilds.value.find((g) => g.id === mappingTarget.value!.id)
        if (guild) {
            const group = groups.allGroups.find((g) => g.id === mappingForm.value.studentGroupId)
            guild.mappings.push({ ...body.data, studentGroupName: group ? groupLabel(group) : null })
        }
        notifs.success('Liaison ajoutée')
        mappingDialog.value = false
    } catch {
        notifs.error("Erreur lors de l'ajout de la liaison")
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
        guild.mappings = guild.mappings.filter((m) => m.id !== mapping.id)
        notifs.success('Liaison supprimée')
    } catch {
        notifs.error('Erreur lors de la suppression')
    } finally {
        deletingMapping.value = null
    }
}

function guildIconUrl(dGuild: DiscordGuild) {
    return dGuild.icon ? `https://cdn.discordapp.com/icons/${dGuild.id}/${dGuild.icon}.png` : null
}

onMounted(fetchGuilds)
</script>

<template>
    <v-container>
        <div class="d-flex align-center justify-space-between mb-2">
            <div class="text-h6">Serveurs Discord</div>
            <div class="d-flex ga-2">
                <v-btn
                    variant="tonal"
                    prepend-icon="fa:fab fa-discord"
                    size="small"
                    @click="openDiscordPanel"
                >
                    Mes serveurs
                </v-btn>
                <v-btn
                    color="primary"
                    prepend-icon="mdi-plus"
                    size="small"
                    @click="guildDialog = true"
                >
                    Ajouter
                </v-btn>
            </div>
        </div>
        <p class="text-body-2 text-medium-emphasis mb-4">
            Les utilisateurs ayant un rôle Discord lié à une classe sont automatiquement approuvés
            comme élèves.
        </p>

        <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-4" />

        <div v-if="guilds.length === 0 && !loading" class="text-center text-medium-emphasis py-8">
            Aucun serveur configuré — cliquez sur « Mes serveurs » pour importer depuis Discord.
        </div>

        <v-card v-for="guild in guilds" :key="guild.id" class="mb-4">
            <v-card-item>
                <template #prepend>
                    <v-icon color="indigo" icon="fa:fab fa-discord" />
                </template>
                <v-card-title>{{ guild.name }}</v-card-title>
                <v-card-subtitle>{{ guild.discordGuildId }}</v-card-subtitle>
                <template #append>
                    <div class="d-flex align-center ga-2">
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
                </template>
            </v-card-item>

            <v-divider v-if="guild.mappings.length > 0" />

            <v-list v-if="guild.mappings.length > 0" density="compact">
                <v-list-item v-for="mapping in guild.mappings" :key="mapping.id">
                    <template #prepend>
                        <v-icon size="16" color="medium-emphasis">mdi-arrow-right</v-icon>
                    </template>
                    <v-list-item-title class="text-body-2">
                        Rôle
                        <code class="text-caption bg-surface-variant px-1 rounded">{{
                            mapping.discordRoleId
                        }}</code>
                        →
                        <strong v-if="mapping.userRole === 'teacher'">Enseignant</strong>
                        <strong v-else>{{
                            mapping.studentGroupName ?? mapping.studentGroupId
                        }}</strong>
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

        <!-- My Discord guilds panel -->
        <v-dialog v-model="discordPanelOpen" max-width="560">
            <v-card>
                <v-card-title class="pt-4 px-4 d-flex align-center ga-2">
                    <v-icon color="indigo" icon="fa:fab fa-discord" />
                    Mes serveurs Discord
                </v-card-title>
                <v-card-subtitle class="px-4 pb-2">
                    Cliquez sur un serveur pour l'ajouter à la liste.
                </v-card-subtitle>

                <v-card-text class="pa-4">
                    <div v-if="loadingDiscordGuilds" class="text-center py-4">
                        <v-progress-circular indeterminate color="primary" size="32" />
                    </div>

                    <div
                        v-else-if="myDiscordGuilds.length === 0"
                        class="text-center text-medium-emphasis py-4"
                    >
                        Aucun serveur trouvé — vérifiez que vous êtes membre d'au moins un serveur.
                    </div>

                    <div v-for="dGuild in myDiscordGuilds" :key="dGuild.id" class="mb-4">
                        <div class="d-flex align-center ga-2 mb-2">
                            <v-avatar size="28" :image="guildIconUrl(dGuild) ?? undefined">
                                <v-icon v-if="!guildIconUrl(dGuild)" size="16">mdi-discord</v-icon>
                            </v-avatar>
                            <span class="font-weight-medium">{{ dGuild.name }}</span>
                            <v-chip
                                size="x-small"
                                label
                                class="text-caption text-medium-emphasis"
                                >{{ dGuild.id }}</v-chip
                            >
                            <v-spacer />
                            <v-btn
                                v-if="!configuredGuildIds.has(dGuild.id)"
                                size="x-small"
                                variant="tonal"
                                color="primary"
                                prepend-icon="mdi-plus"
                                @click="prefillGuildForm(dGuild)"
                            >
                                Ajouter
                            </v-btn>
                            <v-chip v-else size="x-small" color="success" label>Configuré</v-chip>
                        </div>

                        <v-divider class="mt-3" />
                    </div>
                </v-card-text>

                <v-card-actions>
                    <v-spacer />
                    <v-btn variant="text" @click="discordPanelOpen = false">Fermer</v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

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
                    <span
                        v-if="mappingTarget"
                        class="text-body-2 font-weight-regular text-medium-emphasis ml-1"
                    >
                        ({{ mappingTarget.name }})
                    </span>
                </v-card-title>
                <v-card-text class="pa-4">
                    <v-text-field
                        v-model="mappingForm.discordRoleId"
                        label="ID du rôle Discord"
                        variant="outlined"
                        density="compact"
                        hint="Mode développeur Discord → clic droit sur le rôle → Copier l'identifiant"
                        persistent-hint
                    />
                    <v-select
                        v-model="mappingForm.userRole"
                        :items="[
                            { title: 'Élève', value: 'student' },
                            { title: 'Enseignant', value: 'teacher' },
                        ]"
                        label="Rôle attribué"
                        variant="outlined"
                        density="compact"
                        class="mt-3"
                    />
                    <v-select
                        v-if="mappingForm.userRole === 'student'"
                        v-model="mappingForm.studentGroupId"
                        :items="groups.visibleGroups"
                        :item-title="groupLabel"
                        item-value="id"
                        label="Classe"
                        variant="outlined"
                        density="compact"
                    />
                </v-card-text>
                <v-card-actions>
                    <v-spacer />
                    <v-btn variant="text" @click="mappingDialog = false">Annuler</v-btn>
                    <v-btn
                        color="primary"
                        variant="flat"
                        :loading="savingMapping"
                        :disabled="
                            !mappingForm.discordRoleId ||
                            (mappingForm.userRole === 'student' && !mappingForm.studentGroupId)
                        "
                        @click="addMapping"
                    >
                        Créer
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>
    </v-container>
</template>
