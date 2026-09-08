<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { API_URL } from '../lib/api-url'
import { useProvidersStore } from '../stores/providers.js'

const route = useRoute()
const error = route.query.error as string | undefined
const providers = useProvidersStore()

// Icon and colour are a design choice, not configuration; only the name a
// deployment calls its directory by comes from the api.
const STYLES: Record<string, { color: string; icon: string; variant?: 'tonal' }> = {
    discord: { color: 'indigo', icon: 'fa:fab fa-discord' },
    iut: { color: 'primary', icon: 'mdi-school', variant: 'tonal' },
}

const callbackUri = encodeURIComponent(window.location.origin + '/auth/callback')

const buttons = computed(() =>
    providers.providers.map((p) => ({
        ...p,
        ...(STYLES[p.id] ?? { color: 'primary', icon: 'mdi-login' }),
        title:
            p.id === 'discord'
                ? `Connexion avec ${p.label}`
                : `Se connecter avec les identifiants ${p.label}`,
        href: `${API_URL}/api/auth/${p.id}?redirect_uri=${callbackUri}`,
    })),
)

const errorMessages = computed<Record<string, string>>(() => {
    const iut = providers.iutLabel
    return {
        discord_auth_failed: "Échec de l'authentification Discord.",
        discord_user_failed: 'Impossible de récupérer les informations Discord.',
        missing_code: "Code d'autorisation manquant.",
        iut_auth_failed: `Échec de l'authentification ${iut}.`,
        iut_unreachable: `Le service d'authentification ${iut} est injoignable.`,
        iut_state_expired: 'La connexion a expiré, merci de réessayer.',
        iut_state_mismatch: 'La connexion a expiré, merci de réessayer.',
        iut_no_subject: "L'annuaire n'a pas renvoyé d'identifiant utilisable.",
        iut_already_linked: `Ce compte ${iut} est déjà lié à un autre utilisateur.`,
    }
})
</script>

<template>
    <v-container class="d-flex align-center justify-center" style="min-height: 80vh">
        <v-card max-width="400" width="100%" elevation="4">
            <v-card-title class="text-center pt-6 text-h5 font-weight-bold">
                Study Suite
            </v-card-title>
            <v-card-subtitle class="text-center pb-2">
                Connectez-vous pour accéder à votre emploi du temps
            </v-card-subtitle>
            <v-card-text class="pa-6">
                <v-alert v-if="error" type="error" variant="tonal" class="mb-4">
                    {{ errorMessages[error] ?? 'Une erreur est survenue.' }}
                </v-alert>
                <v-btn
                    v-for="(button, index) in buttons"
                    :key="button.id"
                    :href="button.href"
                    :color="button.color"
                    :variant="button.variant"
                    :prepend-icon="button.icon"
                    :class="index > 0 ? 'mt-3' : ''"
                    size="large"
                    block
                >
                    {{ button.title }}
                </v-btn>
            </v-card-text>
        </v-card>
    </v-container>
</template>
