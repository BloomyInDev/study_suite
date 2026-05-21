<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useDisplay, useTheme } from 'vuetify'
import { useRouter } from 'vue-router'
import { useGroupsStore } from './stores/groups.js'
import { useNotificationsStore } from './stores/notifications.js'
import { useAuthStore } from './stores/auth.js'
import GroupPickerDialog from './components/GroupPickerDialog.vue'

const { mobile } = useDisplay()
const theme = useTheme()
const router = useRouter()
const groupsStore = useGroupsStore()
const notifs = useNotificationsStore()
const auth = useAuthStore()

const drawerOpen = ref(false)
const pickerOpen = ref(false)

const isDark = ref(localStorage.getItem('study_suite_theme') === 'dark')
theme.change(isDark.value ? 'dark' : 'light')

function toggleTheme() {
    isDark.value = !isDark.value
    theme.change(isDark.value ? 'dark' : 'light')
    localStorage.setItem('study_suite_theme', isDark.value ? 'dark' : 'light')
}

onMounted(async () => {
    await groupsStore.onLoad()
    if (groupsStore.selectedGroupIds.length === 0) {
        pickerOpen.value = true
    }
})

const commitHash = import.meta.env.VITE_GIT_COMMIT_HASH

const navItems = [
    { title: 'Accueil', icon: 'mdi-home', to: '/' },
    { title: 'Planning', icon: 'mdi-calendar', to: '/planning' },
    { title: 'Enseignants', icon: 'mdi-account-tie', to: '/teachers' },
    { title: 'Salles', icon: 'mdi-door', to: '/rooms' },
    { title: 'Profil', icon: 'mdi-account', to: '/profile' },
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
                    <v-list-item
                        prepend-icon="mdi-shield-crown"
                        title="Admin"
                        to="/admin"
                        @click="drawerOpen = false"
                    />
                </v-list>
            </template>
        </v-navigation-drawer>

        <v-app-bar color="primary" title="Study Suite">
            <template #prepend v-if="mobile">
                <v-app-bar-nav-icon @click="drawerOpen = !drawerOpen" />
            </template>

            <template v-if="!mobile" #append>
                <v-btn v-for="item in navItems" :key="item.to" :to="item.to" icon>
                    <v-icon>{{ item.icon }}</v-icon>
                    <v-tooltip activator="parent" location="bottom">{{ item.title }}</v-tooltip>
                </v-btn>
                <v-divider vertical class="mx-2" />
                <v-btn v-if="auth.isAdmin" icon to="/admin">
                    <v-icon>mdi-shield-crown</v-icon>
                    <v-tooltip activator="parent" location="bottom">Admin</v-tooltip>
                </v-btn>
                <v-btn
                    v-if="auth.isAuthenticated"
                    icon
                    @click="
                        auth.logout()
                        router.push('/login')
                    "
                >
                    <v-icon>mdi-logout</v-icon>
                    <v-tooltip activator="parent" location="bottom">Se déconnecter</v-tooltip>
                </v-btn>
                <v-btn v-else icon to="/login">
                    <v-icon>mdi-login</v-icon>
                    <v-tooltip activator="parent" location="bottom">Se connecter</v-tooltip>
                </v-btn>
                <v-btn icon @click="toggleTheme">
                    <v-icon>{{ isDark ? 'mdi-weather-sunny' : 'mdi-weather-night' }}</v-icon>
                    <v-tooltip activator="parent" location="bottom">{{
                        isDark ? 'Mode clair' : 'Mode sombre'
                    }}</v-tooltip>
                </v-btn>
            </template>

            <template v-else #append>
                <v-btn
                    :icon="isDark ? 'mdi-weather-sunny' : 'mdi-weather-night'"
                    @click="toggleTheme"
                />
            </template>
        </v-app-bar>

        <v-main>
            <router-view />
        </v-main>

        <v-footer class="d-flex flex-column text-center">
            <div class="mb-1">
                Fait avec ❤️ par
                <a
                    href="https://bloomyindev.me"
                    class="text-primary text-decoration-none font-weight-bold"
                    >Bloomy</a
                >
            </div>
            <div class="text-caption text-medium-emphasis">
                Commit Hash:
                <a
                    :href="`https://forge.red.bloomyindev.me/bastien/study_suite/commit/${commitHash}`"
                    class="text-medium-emphasis text-decoration-underline commit-hash"
                    target="_blank"
                    >{{ commitHash }}</a
                >
            </div>
        </v-footer>

        <template v-for="notif in notifs.notifications" :key="notif.id">
            <v-snackbar
                :model-value="true"
                :color="notif.color"
                :timeout="notif.timeout"
                location="bottom right"
                @update:model-value="
                    notifs.notifications.splice(notifs.notifications.indexOf(notif), 1)
                "
            >
                {{ notif.text }}
            </v-snackbar>
        </template>
    </v-app>
</template>

<style scoped>
.commit-hash::after {
    content: ' ↗';
    font-size: 0.75em;
}
</style>
