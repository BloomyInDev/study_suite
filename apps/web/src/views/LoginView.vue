<script setup lang="ts">
import { useRoute } from 'vue-router'

const route = useRoute()
const error = route.query.error as string | undefined

const errorMessages: Record<string, string> = {
  discord_auth_failed: 'Échec de l\'authentification Discord.',
  discord_user_failed: 'Impossible de récupérer les informations Discord.',
  missing_code: 'Code d\'autorisation manquant.',
}

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'
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
          :href="`${API_URL}/auth/discord`"
          color="indigo"
          size="large"
          block
          prepend-icon="mdi-discord"
        >
          Connexion avec Discord
        </v-btn>
      </v-card-text>
    </v-card>
  </v-container>
</template>
