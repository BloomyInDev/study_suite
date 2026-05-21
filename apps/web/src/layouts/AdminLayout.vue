<script setup lang="ts">
import { ref } from 'vue'
import { useDisplay } from 'vuetify'

const { mobile } = useDisplay()
const drawerOpen = ref(false)

const adminNav = [
    { title: 'Groupes', icon: 'mdi-sitemap', to: '/admin/groups' },
    { title: 'Utilisateurs', icon: 'mdi-account-multiple', to: '/admin/users' },
    { title: 'Liaisons Discord', icon: 'fa:fab fa-discord', to: '/admin/discord-mappings' },
]
</script>

<template>
    <div class="d-flex" style="height: 100%">
        <!-- Mobile: temporary drawer via Vuetify overlay -->
        <v-navigation-drawer v-if="mobile" v-model="drawerOpen" temporary>
            <div
                class="text-center text-caption font-weight-bold text-uppercase pa-4 text-medium-emphasis"
            >
                Administration
            </div>
            <v-divider />
            <v-list nav>
                <v-list-item
                    v-for="item in adminNav"
                    :key="item.to"
                    :prepend-icon="item.icon"
                    :title="item.title"
                    :to="item.to"
                    @click="drawerOpen = false"
                />
            </v-list>
        </v-navigation-drawer>

        <!-- Desktop: inline sidebar, contained in v-main -->
        <nav
            v-if="!mobile"
            style="
                width: 256px;
                min-width: 256px;
                border-right: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
            "
        >
            <div
                class="text-center text-caption font-weight-bold text-uppercase pa-4 text-medium-emphasis"
            >
                Administration
            </div>
            <v-divider />
            <v-list nav>
                <v-list-item
                    v-for="item in adminNav"
                    :key="item.to"
                    :prepend-icon="item.icon"
                    :title="item.title"
                    :to="item.to"
                />
            </v-list>
        </nav>

        <div class="flex-grow-1">
            <v-btn v-if="mobile" icon class="ma-2" @click="drawerOpen = true">
                <v-icon>mdi-menu</v-icon>
            </v-btn>
            <router-view />
        </div>
    </div>
</template>
