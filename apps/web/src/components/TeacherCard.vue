<script setup lang="ts">
import type { Teacher } from '../lib/types.js'

defineProps<{
    teacher: Teacher
    available?: boolean
}>()
</script>

<template>
    <v-card hover ripple>
        <v-card-title>{{ teacher.firstName }} {{ teacher.lastName }}</v-card-title>
        <v-card-text v-if="available !== undefined">
            <v-chip :color="available ? 'success' : 'error'" size="small">
                {{ available ? 'Disponible' : 'Occupé' }}
            </v-chip>
        </v-card-text>
    </v-card>
</template>
