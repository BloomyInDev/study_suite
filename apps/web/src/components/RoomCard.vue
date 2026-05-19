<script setup lang="ts">
import type { Room } from '../lib/types.js'

defineProps<{
  room: Room
  available?: boolean
}>()
</script>

<template>
  <v-card hover ripple>
    <v-card-title>{{ room.name }}</v-card-title>
    <v-card-text v-if="available !== undefined">
      <v-chip :color="available ? 'success' : 'error'" size="small">
        {{ available ? 'Disponible' : 'Occupée' }}
      </v-chip>
    </v-card-text>
  </v-card>
</template>
