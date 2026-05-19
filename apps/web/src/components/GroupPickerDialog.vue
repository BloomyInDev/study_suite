<script setup lang="ts">
import { computed, ref } from 'vue'
import { useGroupsStore } from '../stores/groups.js'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const groups = useGroupsStore()
const search = ref('')
const selected = ref<string[]>([...groups.selectedGroupIds])

const show = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const filtered = computed(() => {
  const q = search.value.toLowerCase()
  return q ? groups.allGroups.filter(g => g.internalName.toLowerCase().includes(q)) : groups.allGroups
})

const confirm = () => {
  groups.select(selected.value)
  show.value = false
}
</script>

<template>
  <v-dialog v-model="show" max-width="480" persistent>
    <v-card>
      <v-card-title class="text-h5 pt-4 px-4">Choisir mes groupes</v-card-title>
      <v-card-text class="pa-4">
        <v-text-field
          v-model="search"
          label="Rechercher"
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          hide-details
          class="mb-3"
        />
        <v-list lines="one" select-strategy="classic" v-model:selected="selected" density="compact" max-height="320" style="overflow-y: auto">
          <v-list-item
            v-for="g in filtered"
            :key="g.id"
            :value="g.id"
            :title="g.internalName"
          >
            <template #prepend="{ isSelected }">
              <v-checkbox-btn :model-value="isSelected" />
            </template>
          </v-list-item>
        </v-list>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="show = false" v-if="groups.selectedGroupIds.length > 0">Annuler</v-btn>
        <v-btn color="primary" variant="flat" @click="confirm" :disabled="selected.length === 0">
          Valider ({{ selected.length }})
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
