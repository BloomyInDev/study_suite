<script setup lang="ts">
import { useDisplay } from 'vuetify'

const { mobile } = useDisplay()

const adminNav = [
  { title: 'Groupes', icon: 'mdi-sitemap', to: '/admin/groups' },
]
</script>

<template>
  <v-navigation-drawer :permanent="!mobile" :temporary="mobile" location="left">
    <v-list-subheader class="ml-2">Admin</v-list-subheader>
    <v-list nav>
      <v-list-item
        v-for="item in adminNav"
        :key="item.to"
        :prepend-icon="item.icon"
        :title="item.title"
        :to="item.to"
      />
    </v-list>
  </v-navigation-drawer>

  <router-view />
</template>
