<script setup lang="ts">
import { ref } from 'vue'
import GroupPickerDialog from '../components/GroupPickerDialog.vue'
import { useGroupsStore } from '../stores/groups.js'

const groups = useGroupsStore()
const pickerOpen = ref(false)
</script>

<template>
    <v-container>
        <v-row>
            <v-col cols="12" md="6">
                <v-card>
                    <v-card-title>Mes groupes</v-card-title>
                    <v-card-text>
                        <v-chip v-for="id in groups.selectedGroupIds" :key="id" class="mr-2 mb-2">
                            {{ groups.allGroups.find((g) => g.id === id)?.internalName ?? id }}
                        </v-chip>
                        <div
                            v-if="groups.selectedGroupIds.length === 0"
                            class="text-medium-emphasis"
                        >
                            Aucun groupe sélectionné
                        </div>
                    </v-card-text>
                    <v-card-actions>
                        <v-btn
                            color="primary"
                            variant="flat"
                            prepend-icon="mdi-pencil"
                            @click="pickerOpen = true"
                        >
                            Changer
                        </v-btn>
                    </v-card-actions>
                </v-card>
            </v-col>
        </v-row>
    </v-container>

    <GroupPickerDialog v-model="pickerOpen" />
</template>
