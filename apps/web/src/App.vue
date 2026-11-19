<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useDisplay, useTheme } from 'vuetify'
import { useRoute, useRouter } from 'vue-router'
import { useGroupsStore } from './stores/groups.js'
import { useNotificationsStore } from './stores/notifications.js'
import { useAuthStore } from './stores/auth.js'
import { useProvidersStore } from './stores/providers.js'
import { useRemindersStore } from './stores/reminders.js'
import { useHiddenCoursesStore } from './stores/hidden-courses.js'
import { useTermsStore } from './stores/terms.js'
import { useAdminModeStore } from './stores/admin-mode.js'
import TermsBanner from './components/TermsBanner.vue'
import { usePageSeo } from './lib/seo.js'
import { adminMenus } from './lib/admin-nav.js'

const { mobile } = useDisplay()
const theme = useTheme()
const router = useRouter()
const route = useRoute()
const groupsStore = useGroupsStore()
const providersStore = useProvidersStore()
const notifs = useNotificationsStore()
const auth = useAuthStore()
const reminders = useRemindersStore()
const hiddenCourses = useHiddenCoursesStore()
const terms = useTermsStore()
const adminMode = useAdminModeStore()
const adminNav = computed(() => adminMenus(providersStore.iutLabel))

// The admin pages need admin mode (router guard). Leaving the mode while on one
// would strand the admin on a page the nav no longer offers.
watch(
    () => adminMode.active,
    (active) => {
        if (!active && route.path.startsWith('/admin')) void router.push('/')
    },
)

// The one place the head is wired up: every page's title and og: tags come from
// lib/pages.ts and follow the route, so no view carries head code of its own.
usePageSeo()

const drawerOpen = ref(false)

const isDark = ref(localStorage.getItem('study_suite_theme') === 'dark')
theme.change(isDark.value ? 'dark' : 'light')

function logout() {
    auth.logout()
    router.push('/login')
}

function logoutFromDrawer() {
    drawerOpen.value = false
    logout()
}

function toggleTheme() {
    isDark.value = !isDark.value
    theme.change(isDark.value ? 'dark' : 'light')
    localStorage.setItem('study_suite_theme', isDark.value ? 'dark' : 'light')
}

onMounted(async () => {
    // Which login providers exist, and what this deployment calls them. Not
    // awaited: nothing below branches on it, and the defaults render fine.
    void providersStore.fetchProviders()
    // auth.user is restored from localStorage, so it still holds whatever was
    // true at the last login: a class an admin has since changed, a status that
    // has since been approved. Re-read it before anything branches on it.
    await auth.refresh()
    await groupsStore.onLoad()
    // CGU accepted as a visitor, before signing in: put them on the account.
    void terms.syncAccount()

    // A browser that subscribed to course reminders sends its groups to the api
    // once, at subscribe time. Re-sync them here, and on every later change: an
    // admin moving a student to another class, or the visitor picking different
    // groups, would otherwise keep being reminded of their old timetable.
    await reminders.init()
})

// A login lands here without a reload, through the callback route.
watch(
    () => auth.user?.id,
    (id) => id && void terms.syncAccount(),
)

watch(
    () => groupsStore.effectiveGroupIds,
    () => void reminders.syncGroups(),
    { deep: true },
)
// Hiding a course has to reach the api too, or the reminder still fires.
watch(
    () => hiddenCourses.key,
    () => void reminders.syncGroups(),
)

const commitHash = import.meta.env.VITE_GIT_COMMIT_HASH
const shortHash = commitHash?.slice(0, 7) ?? 'unknown'

// Every page stays listed: the router sends a visitor to /login when a page
// needs an account, which explains the app better than hiding it would.
const navItems = [
    { title: 'Accueil', icon: 'mdi-home', to: '/' },
    { title: 'Planning', icon: 'mdi-calendar', to: '/planning' },
    { title: 'Groupes', icon: 'mdi-account-group', to: '/groups' },
    { title: 'Devoirs', icon: 'mdi-book-edit', to: '/homework' },
    { title: 'Enseignants', icon: 'mdi-account-tie', to: '/teachers' },
    { title: 'Salles', icon: 'mdi-door', to: '/rooms' },
    { title: 'Profil', icon: 'mdi-account', to: '/profile' },
]
</script>

<template>
    <v-app>
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
                <template v-if="adminMode.active">
                    <template v-for="menu in adminNav" :key="menu.title">
                        <v-list-subheader>{{ menu.title }}</v-list-subheader>
                        <v-list-item
                            v-for="item in menu.items"
                            :key="item.to"
                            :prepend-icon="item.icon"
                            :title="item.title"
                            :to="item.to"
                            @click="drawerOpen = false"
                        />
                    </template>
                </template>
            </v-list>
            <template #append>
                <v-divider />
                <v-list nav density="compact">
                    <v-list-item
                        v-if="auth.isAdmin"
                        :prepend-icon="adminMode.active ? 'mdi-shield-alert' : 'mdi-shield-outline'"
                        :title="adminMode.active ? 'Quitter le mode admin' : 'Mode admin'"
                        :base-color="adminMode.active ? 'error' : undefined"
                        @click="adminMode.toggle()"
                    />
                    <v-list-item
                        v-if="auth.isAuthenticated"
                        prepend-icon="mdi-logout"
                        title="Se déconnecter"
                        :subtitle="auth.user?.displayName"
                        @click="logoutFromDrawer"
                    />
                    <v-list-item
                        v-else
                        prepend-icon="mdi-login"
                        title="Se connecter"
                        to="/login"
                        @click="drawerOpen = false"
                    />
                </v-list>
            </template>
        </v-navigation-drawer>

        <v-app-bar
            :color="adminMode.active ? 'error' : 'primary'"
            :title="adminMode.active ? 'Study Suite · admin' : 'Study Suite'"
        >
            <template #prepend v-if="mobile">
                <v-app-bar-nav-icon @click="drawerOpen = !drawerOpen" />
            </template>

            <template v-if="!mobile" #append>
                <v-btn v-for="item in navItems" :key="item.to" :to="item.to" icon>
                    <v-icon>{{ item.icon }}</v-icon>
                    <v-tooltip activator="parent" location="bottom">{{ item.title }}</v-tooltip>
                </v-btn>
                <template v-if="adminMode.active">
                    <v-divider vertical class="mx-2" />
                    <v-menu v-for="menu in adminNav" :key="menu.title" location="bottom end">
                        <template #activator="{ props: menuProps }">
                            <v-btn icon v-bind="menuProps">
                                <v-icon>{{ menu.icon }}</v-icon>
                                <v-tooltip activator="parent" location="bottom">{{
                                    menu.title
                                }}</v-tooltip>
                            </v-btn>
                        </template>
                        <v-list density="compact" nav>
                            <v-list-subheader>{{ menu.title }}</v-list-subheader>
                            <v-list-item
                                v-for="item in menu.items"
                                :key="item.to"
                                :prepend-icon="item.icon"
                                :title="item.title"
                                :to="item.to"
                            />
                        </v-list>
                    </v-menu>
                </template>
                <v-divider vertical class="mx-2" />
                <v-btn v-if="auth.isAdmin" icon @click="adminMode.toggle()">
                    <v-icon>{{
                        adminMode.active ? 'mdi-shield-alert' : 'mdi-shield-outline'
                    }}</v-icon>
                    <v-tooltip activator="parent" location="bottom">{{
                        adminMode.active ? 'Quitter le mode admin' : 'Mode admin'
                    }}</v-tooltip>
                </v-btn>
                <v-btn v-if="auth.isAuthenticated" icon @click="logout">
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
            <nav class="text-caption d-flex flex-wrap justify-center ga-3 mb-1">
                <router-link to="/legal" class="text-medium-emphasis">Mentions légales</router-link>
                <router-link to="/privacy" class="text-medium-emphasis"
                    >Confidentialité</router-link
                >
                <router-link to="/terms" class="text-medium-emphasis">CGU</router-link>
            </nav>
            <div class="text-caption text-medium-emphasis">
                Commit Hash:
                <a
                    :href="`https://github.com/BloomyInDev/study_suite/commit/${commitHash}`"
                    class="text-medium-emphasis text-decoration-underline commit-hash"
                    target="_blank"
                    >{{ shortHash }}</a
                >
            </div>
        </v-footer>

        <TermsBanner />

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
