<script setup lang="ts">
import { computed } from 'vue'
import type { Event } from '../lib/types.js'
import { formatTime } from '../lib/date.js'
import EventDetailsDialog from './EventDetailsDialog.vue'

const props = defineProps<{ event: { color?: string; name?: string; full?: Event } }>()

const eventFull = computed<Event>(() => props.event.full!)
</script>

<template>
  <EventDetailsDialog :event="eventFull">
    <template #activator="{ props: aProps }">
      <v-card v-bind="aProps" :color="props.event.color" variant="flat" class="fill-height" link>
        <v-card-text class="pa-1">
          <div class="text-caption font-weight-bold">
            {{ formatTime(eventFull.start) }} - {{ formatTime(eventFull.end) }}
          </div>
          <div class="text-body-2">{{ props.event.name }}</div>
          <div class="text-caption">
            {{ eventFull.teachers.map(t => `${t.firstName} ${t.lastName}`).join(', ') }}
          </div>
          <div class="text-caption">{{ eventFull.rooms.map(r => r.name).join(', ') }}</div>
          <div class="text-caption">
            {{ eventFull.groups.map(g => g.internalName).join(', ') || 'Aucun groupe' }}
          </div>
        </v-card-text>
      </v-card>
    </template>
  </EventDetailsDialog>
</template>
