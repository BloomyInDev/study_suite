<script setup lang="ts">
const emit = defineEmits<{ openPicker: [] }>()
</script>

<template>
  <v-card class="text-center pa-6">
    <v-icon size="64" color="warning" class="mb-4">mdi-alert-circle-outline</v-icon>
    <h2 class="text-h5 mb-2">Aucun groupe sélectionné</h2>
    <p class="text-body-1 text-medium-emphasis mb-4">
      Sélectionnez vos groupes pour voir votre emploi du temps.
    </p>
    <v-btn color="primary" prepend-icon="mdi-account-cog" @click="emit('openPicker')">
      Choisir mes groupes
    </v-btn>
  </v-card>
</template>
