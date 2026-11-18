<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useTermsStore } from '../stores/terms.js'

const terms = useTermsStore()

// The server render has no localStorage and would print the bar into every
// page, for it to vanish on load for anyone who already accepted. Client only.
// Sticky rather than fixed: it rides the viewport while scrolling, then comes to
// rest after the site footer instead of covering its links.
const mounted = ref(false)
onMounted(() => (mounted.value = true))
</script>

<template>
    <v-sheet v-if="mounted && !terms.accepted" elevation="8" class="terms-banner py-3 px-4">
        <div class="d-flex flex-wrap align-center justify-center ga-3 w-100">
            <span class="text-body-2">
                En utilisant Study Suite, tu acceptes les
                <router-link to="/terms">conditions d'utilisation</router-link>. Ce que l'app garde
                sur toi : <router-link to="/privacy">politique de confidentialité</router-link>.
            </span>
            <v-btn color="primary" size="small" @click="terms.accept()">Accepter</v-btn>
        </div>
    </v-sheet>
</template>

<style scoped>
.terms-banner {
    position: sticky;
    bottom: 0;
    z-index: 1005;
}
.terms-banner a {
    color: rgb(var(--v-theme-primary));
}
</style>
