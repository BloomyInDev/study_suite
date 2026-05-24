<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'

const auth = useAuthStore()
const router = useRouter()
const refreshing = ref(false)

async function checkApproval() {
    refreshing.value = true
    try {
        await auth.refresh()
        if (auth.isApproved) router.push('/')
    } finally {
        refreshing.value = false
    }
}
</script>

<template>
    <v-container class="d-flex align-center justify-center" style="min-height: 80vh">
        <v-card max-width="480" width="100%" elevation="4">
            <v-card-text class="text-center pa-8">
                <v-icon size="64" color="warning" class="mb-4">mdi-clock-outline</v-icon>
                <div class="text-h6 font-weight-bold mb-2">Compte en attente</div>
                <div class="text-medium-emphasis mb-6">
                    Votre compte est en attente de validation par un administrateur. Vous serez
                    notifié dès que votre accès sera approuvé.
                </div>
                <div class="text-caption text-medium-emphasis mb-6">
                    Connecté en tant que
                    <strong>{{ auth.user?.discordUsername }}</strong>
                </div>
                <div class="d-flex flex-column gap-2">
                    <v-btn
                        color="primary"
                        prepend-icon="mdi-refresh"
                        :loading="refreshing"
                        @click="checkApproval"
                    >
                        Vérifier mon statut
                    </v-btn>
                    <v-btn
                        variant="text"
                        color="error"
                        prepend-icon="mdi-logout"
                        @click="
                            auth.logout()
                            $router.push('/login')
                        "
                    >
                        Se déconnecter
                    </v-btn>
                </div>
            </v-card-text>
        </v-card>
    </v-container>
</template>
