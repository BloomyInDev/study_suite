<script setup lang="ts">
import type { Event } from '../lib/types.js'
import { formatTime, formatTimeUntil } from '../lib/date.js'

const props = defineProps<{
    event: Event
    isCurrent: boolean
    now?: Date
}>()
</script>

<template>
    <v-card :color="isCurrent ? 'primary' : undefined">
        <v-card-item>
            <template #prepend>
                <v-icon :color="isCurrent ? 'white' : 'primary'" size="32">
                    {{ isCurrent ? 'mdi-clock' : 'mdi-clock-outline' }}
                </v-icon>
            </template>
            <v-card-title :class="isCurrent ? 'text-white' : ''">
                {{ isCurrent ? 'En cours' : 'Prochain cours' }}
            </v-card-title>
            <v-card-subtitle :class="isCurrent ? 'text-white' : ''">
                {{
                    isCurrent
                        ? `Jusqu'à ${formatTime(event.end)} (${formatTimeUntil(event.end, 'termine dans', props.now)})`
                        : formatTimeUntil(event.start, 'dans', props.now)
                }}
            </v-card-subtitle>
        </v-card-item>
        <v-card-text>
            <h3
                class="text-h5 font-weight-bold mb-2"
                :class="isCurrent ? 'text-white text-truncate' : 'text-truncate'"
            >
                {{ event.title }}
            </h3>
            <div
                class="d-flex align-center mb-1"
                :class="isCurrent ? 'text-white' : 'text-medium-emphasis'"
            >
                <v-icon size="18" class="mr-2">mdi-clock-outline</v-icon>
                {{ formatTime(event.start) }} - {{ formatTime(event.end) }}
            </div>
            <div
                v-if="event.rooms.length"
                class="d-flex align-center"
                :class="isCurrent ? 'text-white' : 'text-medium-emphasis'"
            >
                <v-icon size="18" class="mr-2">mdi-map-marker</v-icon>
                {{ event.rooms.map((r) => r.name).join(', ') }}
            </div>
        </v-card-text>
        <v-card-actions>
            <v-btn
                :variant="isCurrent ? 'outlined' : 'flat'"
                :color="isCurrent ? 'white' : 'primary'"
                to="/planning"
                append-icon="mdi-arrow-right"
            >
                Voir l'emploi du temps
            </v-btn>
        </v-card-actions>
    </v-card>
</template>
