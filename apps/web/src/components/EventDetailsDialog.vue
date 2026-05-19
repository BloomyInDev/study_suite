<script setup lang="ts">
import type { Event } from '../lib/types.js'
import { formatFullDate } from '../lib/date.js'

defineProps<{ event: Event }>()

const groupAccentClass = (index: number): string => {
  const accents = ['group-badge--blue', 'group-badge--teal', 'group-badge--amber', 'group-badge--rose']
  return accents[index % accents.length]!
}
</script>

<template>
  <v-dialog max-width="500">
    <template #activator="{ props }">
      <slot name="activator" :props="props" />
    </template>
    <template #default="{ isActive }">
      <v-card :title="event.title">
        <v-card-text>
          <div class="mb-2"><strong>Titre :</strong> {{ event.title }}</div>
          <div class="mb-2">
            <strong>Groupes :</strong>
            <div v-if="event.groups.length > 0" class="group-list mt-1">
              <span
                v-for="(group, index) in event.groups"
                :key="group.id"
                :class="['group-badge', groupAccentClass(index)]"
              >{{ group.internalName }}</span>
            </div>
            <span v-else>Aucun groupe</span>
          </div>
          <div class="mb-2">
            <strong>Date et heure :</strong><br />
            {{ formatFullDate(event.start) }}<br />
            {{ formatFullDate(event.end) }}
          </div>
          <div class="mb-2">
            <strong>Enseignants :</strong>
            {{ event.teachers.map(t => `${t.firstName} ${t.lastName}`).join(', ') || 'N/A' }}
          </div>
          <div v-if="event.rooms.length > 0">
            <strong>Salle :</strong> {{ event.rooms.map(r => r.name).join(', ') }}
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text="Fermer" @click="isActive.value = false" />
        </v-card-actions>
      </v-card>
    </template>
  </v-dialog>
</template>

<style scoped>
.group-list { display: flex; flex-wrap: wrap; gap: 8px; }
.group-badge {
  display: inline-flex; align-items: center; padding: 3px 10px;
  border-radius: 999px; border: 1px solid transparent;
  font-size: 0.8rem; font-weight: 600; line-height: 1.2;
}
.group-badge--blue  { color: #0c4a6e; background: #e0f2fe; border-color: #7dd3fc; }
.group-badge--teal  { color: #115e59; background: #ccfbf1; border-color: #5eead4; }
.group-badge--amber { color: #92400e; background: #fef3c7; border-color: #fcd34d; }
.group-badge--rose  { color: #9f1239; background: #ffe4e6; border-color: #fda4af; }
</style>
