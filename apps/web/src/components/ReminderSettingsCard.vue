<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { LEAD_CHOICES, useRemindersStore } from '../stores/reminders.js'
import { useGroupsStore } from '../stores/groups.js'
import { useNotificationsStore } from '../stores/notifications.js'

const reminders = useRemindersStore()
const groups = useGroupsStore()
const notifs = useNotificationsStore()

const testing = ref(false)

const leadItems = LEAD_CHOICES.map((minutes) => ({
    title: minutes < 60 ? `${minutes} minutes avant` : '1 heure avant',
    value: minutes,
}))

/** Reminders match on groups; without one there is nothing to announce. */
const hasGroups = computed(() => groups.effectiveGroupIds.length > 0)

onMounted(() => void reminders.init())

async function toggle(value: boolean | null) {
    if (value) {
        if (await reminders.enable()) notifs.success('Rappels activés')
        else if (reminders.error) notifs.error(reminders.error)
    } else {
        await reminders.disable()
        notifs.info('Rappels désactivés')
    }
}

async function runTest() {
    testing.value = true
    try {
        const result = await reminders.test()
        if (result === 'sent') notifs.success('Notification envoyée')
        else if (result === 'not-subscribed') notifs.error("Ce navigateur n'est pas abonné")
        else notifs.error("L'envoi a échoué — vérifie que les notifications sont autorisées")
    } finally {
        testing.value = false
    }
}
</script>

<template>
    <v-card>
        <v-card-title>Rappels de cours</v-card-title>
        <v-card-subtitle>Une notification avant chaque cours</v-card-subtitle>

        <v-card-text>
            <v-alert
                v-if="reminders.blocked"
                type="warning"
                variant="tonal"
                density="compact"
                class="mb-3"
            >
                Les notifications sont bloquées pour ce site. Autorise-les dans les réglages du
                navigateur, puis reviens ici.
            </v-alert>

            <v-alert
                v-else-if="!hasGroups"
                type="warning"
                variant="tonal"
                density="compact"
                class="mb-3"
            >
                Choisis d'abord un groupe : les rappels suivent ton emploi du temps.
            </v-alert>

            <v-switch
                :model-value="reminders.subscribed"
                :disabled="reminders.busy || reminders.blocked || !hasGroups"
                :loading="reminders.busy"
                color="primary"
                density="compact"
                hide-details
                label="Me prévenir avant chaque cours"
                class="mb-2"
                @update:model-value="toggle"
            />

            <v-select
                :model-value="reminders.leadMinutes"
                :items="leadItems"
                :disabled="!reminders.subscribed || reminders.busy"
                label="Quand"
                variant="outlined"
                density="compact"
                hide-details
                class="mb-3"
                @update:model-value="reminders.setLead"
            />

            <div class="text-caption text-medium-emphasis">
                Le réglage vaut pour ce navigateur uniquement — active-le aussi sur ton téléphone si
                tu veux y être prévenu.
            </div>
        </v-card-text>

        <v-card-actions v-if="reminders.subscribed">
            <v-btn
                :loading="testing"
                variant="tonal"
                size="small"
                prepend-icon="mdi-bell-ring"
                @click="runTest"
            >
                Tester
            </v-btn>
        </v-card-actions>
    </v-card>
</template>
