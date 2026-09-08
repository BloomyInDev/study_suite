<script setup lang="ts">
import { API_URL } from '../lib/api-url'
import { useRoute } from 'vue-router'

const route = useRoute()
const error = route.query.error as string | undefined

const errorMessages: Record<string, string> = {
    discord_auth_failed: "Échec de l'authentification Discord.",
    discord_user_failed: 'Impossible de récupérer les informations Discord.',
    missing_code: "Code d'autorisation manquant.",
    iut_auth_failed: "Échec de l'authentification IUT.",
    iut_unreachable: "Le service d'authentification de l'IUT est injoignable.",
    iut_state_expired: 'La connexion a expiré, merci de réessayer.',
    iut_state_mismatch: 'La connexion a expiré, merci de réessayer.',
    iut_no_subject: "L'annuaire n'a pas renvoyé d'identifiant utilisable.",
    iut_already_linked: 'Ce compte IUT est déjà lié à un autre utilisateur.',
}

const callbackUri = encodeURIComponent(window.location.origin + '/auth/callback')
const discordLoginUrl = `${API_URL}/api/auth/discord?redirect_uri=${callbackUri}`
const iutLoginUrl = `${API_URL}/api/auth/iut?redirect_uri=${callbackUri}`
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
                    :href="discordLoginUrl"
                    color="indigo"
                    size="large"
                    block
                    prepend-icon="fa:fab fa-discord"
                >
                    Connexion avec Discord
                </v-btn>
                <v-btn
                    :href="iutLoginUrl"
                    color="primary"
                    variant="tonal"
                    size="large"
                    block
                    class="mt-3"
                    prepend-icon="mdi-school"
                >
                    Connexion avec l'IUT
                </v-btn>
            </v-card-text>
        </v-card>
    </v-container>
</template>
