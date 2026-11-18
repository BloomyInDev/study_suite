<script setup lang="ts">
import { LEGAL_UPDATED_AT } from '../lib/legal.js'

defineProps<{ title: string }>()
</script>

<template>
    <v-container class="legal py-8" style="max-width: 820px">
        <h1 class="text-h4 font-weight-bold mb-1">{{ title }}</h1>
        <p class="text-caption text-medium-emphasis mb-6">
            Dernière mise à jour : {{ LEGAL_UPDATED_AT }}
        </p>
        <slot />
        <v-divider class="my-6" />
        <nav class="text-body-2 d-flex flex-wrap ga-4">
            <router-link to="/legal">Mentions légales</router-link>
            <router-link to="/privacy">Confidentialité</router-link>
            <router-link to="/terms">Conditions d'utilisation</router-link>
        </nav>
    </v-container>
</template>

<style scoped>
.legal :deep(h2) {
    font-size: 1.25rem;
    font-weight: 600;
    margin: 2rem 0 0.75rem;
}
.legal :deep(p),
.legal :deep(ul) {
    margin-bottom: 0.75rem;
    line-height: 1.6;
}
.legal :deep(ul) {
    padding-left: 1.5rem;
}
.legal :deep(li) {
    margin-bottom: 0.25rem;
}
.legal :deep(a) {
    color: rgb(var(--v-theme-primary));
}
</style>
