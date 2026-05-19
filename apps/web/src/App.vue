<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useDisplay, useTheme } from 'vuetify'
import { useGroupsStore } from './stores/groups.js'
import { useNotificationsStore } from './stores/notifications.js'
import GroupPickerDialog from './components/GroupPickerDialog.vue'

const { mobile } = useDisplay()
const theme = useTheme()
const groupsStore = useGroupsStore()
const notifs = useNotificationsStore()

const drawerOpen = ref(false)
const pickerOpen = ref(false)

const isDark = ref(localStorage.getItem('study_suite_theme') === 'dark')
theme.global.name.value = isDark.value ? 'dark' : 'light'

function toggleTheme() {
  isDark.value = !isDark.value
  theme.global.name.value = isDark.value ? 'dark' : 'light'
  localStorage.setItem('study_suite_theme', isDark.value ? 'dark' : 'light')
}

onMounted(async () => {
  await groupsStore.onLoad()
  if (groupsStore.selectedGroupIds.length === 0) {
    pickerOpen.value = true
  }
})

const navItems = [
  { title: 'Accueil', icon: 'mdi-home', to: '/' },
  { title: 'Planning', icon: 'mdi-calendar', to: '/planning' },
  { title: 'Comparer', icon: 'mdi-compare', to: '/planning/compare' },
  { title: 'Enseignants', icon: 'mdi-account-tie', to: '/teachers' },
  { title: 'Salles', icon: 'mdi-door', to: '/rooms' },
]

const adminItems = [
  { title: 'Groupes', icon: 'mdi-sitemap', to: '/admin/groups' },
]
</script>

<template>
  <v-app>
    <GroupPickerDialog v-model="pickerOpen" />

    <v-navigation-drawer v-if="mobile" v-model="drawerOpen" temporary>
      <v-list nav>
        <v-list-item
          v-for="item in navItems"
          :key="item.to"
          :prepend-icon="item.icon"
          :title="item.title"
          :to="item.to"
          @click="drawerOpen = false"
        />
      </v-list>
      <template #append>
        <v-divider />
        <v-list nav density="compact">
          <v-list-subheader>Admin</v-list-subheader>
          <v-list-item
            v-for="item in adminItems"
            :key="item.to"
            :prepend-icon="item.icon"
            :title="item.title"
            :to="item.to"
            @click="drawerOpen = false"
          />
          <v-divider class="my-1" />
          <v-list-item
            prepend-icon="mdi-account-group"
            title="Mes groupes"
            @click="pickerOpen = true; drawerOpen = false"
          />
        </v-list>
      </template>
    </v-navigation-drawer>

    <v-app-bar elevation="1">
      <v-app-bar-nav-icon v-if="mobile" @click="drawerOpen = !drawerOpen" />
      <v-app-bar-title>
        <span class="font-weight-bold">Study Suite</span>
      </v-app-bar-title>

      <template v-if="!mobile" #append>
        <v-btn
          v-for="item in navItems"
          :key="item.to"
          :prepend-icon="item.icon"
          variant="text"
          :to="item.to"
        >
          {{ item.title }}
        </v-btn>
        <v-divider vertical class="mx-2" />
        <v-tooltip
          v-for="item in adminItems"
          :key="item.to"
          :text="item.title"
          location="bottom"
        >
          <template #activator="{ props }">
            <v-btn v-bind="props" :icon="item.icon" variant="text" :to="item.to" />
          </template>
        </v-tooltip>
        <v-divider vertical class="mx-2" />
        <v-tooltip text="Mes groupes" location="bottom">
          <template #activator="{ props }">
            <v-btn v-bind="props" icon="mdi-account-group" variant="text" @click="pickerOpen = true" />
          </template>
        </v-tooltip>
        <v-tooltip :text="isDark ? 'Mode clair' : 'Mode sombre'" location="bottom">
          <template #activator="{ props }">
            <v-btn
              v-bind="props"
              :icon="isDark ? 'mdi-weather-sunny' : 'mdi-weather-night'"
              variant="text"
              @click="toggleTheme"
            />
          </template>
        </v-tooltip>
      </template>

      <template v-else #append>
        <v-btn
          :icon="isDark ? 'mdi-weather-sunny' : 'mdi-weather-night'"
          variant="text"
          @click="toggleTheme"
        />
      </template>
    </v-app-bar>

    <v-main>
      <router-view />
    </v-main>

    <v-footer app border="t" class="text-caption text-medium-emphasis justify-center">
      Study Suite
    </v-footer>

    <template v-for="notif in notifs.notifications" :key="notif.id">
      <v-snackbar
        :model-value="true"
        :color="notif.color"
        :timeout="notif.timeout"
        location="bottom right"
        @update:model-value="notifs.notifications.splice(notifs.notifications.indexOf(notif), 1)"
      >
        {{ notif.text }}
      </v-snackbar>
    </template>
  </v-app>
</template>
