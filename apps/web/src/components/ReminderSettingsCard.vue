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

/**
 * Safari only grants push to a PWA on the home screen, and it is the single
 * most common reason for "it does nothing on my iPhone".
 */
const isIos = computed(() => !import.meta.env.SSR && /iP(hone|ad|od)/.test(navigator.userAgent))
const isStandalone = computed(
    () =>
        !import.meta.env.SSR &&
        (window.matchMedia('(display-mode: standalone)').matches ||
            (navigator as { standalone?: boolean }).standalone === true),
)

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
            <v-alert v-if="!reminders.supported" type="info" variant="tonal" density="compact">
                Ce navigateur ne gère pas les notifications push.
            </v-alert>

            <v-alert v-else-if="!reminders.available" type="info" variant="tonal" density="compact">
                Les rappels ne sont pas activés sur cette instance.
            </v-alert>

            <template v-else>
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
                    v-else-if="isIos && !isStandalone"
                    type="info"
                    variant="tonal"
                    density="compact"
                    class="mb-3"
                >
                    Sur iPhone, les notifications ne fonctionnent qu'une fois l'app ajoutée à
                    l'écran d'accueil (Partager → Sur l'écran d'accueil).
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
                    Le réglage vaut pour ce navigateur uniquement — active-le aussi sur ton
                    téléphone si tu veux y être prévenu.
                </div>
            </template>
        </v-card-text>

        <v-card-actions v-if="reminders.available && reminders.subscribed">
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
