import type { RouteRecordRaw, Router } from 'vue-router'
import { useAuthStore } from './stores/auth.js'

// vite-ssg owns the router instance — it needs a memory history to render each
// route at build time — so this module only describes the routes and the guard.
export const routes: RouteRecordRaw[] = [
    { path: '/login', component: () => import('./views/LoginView.vue') },
    { path: '/pending', component: () => import('./views/PendingView.vue') },
    { path: '/auth/callback', component: () => import('./views/AuthCallbackView.vue') },
    { path: '/', component: () => import('./views/HomeView.vue') },
    { path: '/planning', component: () => import('./views/PlanningView.vue') },
    {
        path: '/planning/changes',
        component: () => import('./views/PlanningChangesView.vue'),
    },
    {
        path: '/planning/compare',
        component: () => import('./views/PlanningComparisonView.vue'),
    },
    {
        path: '/teachers',
        component: () => import('./views/TeachersView.vue'),
        meta: { requiresAuth: true },
    },
    {
        path: '/rooms',
        component: () => import('./views/RoomsView.vue'),
        meta: { requiresAuth: true },
    },
    {
        path: '/homework',
        component: () => import('./views/AssignmentsView.vue'),
        meta: { requiresAuth: true },
    },
    // No auth: a visitor's group selection lives here too, and the view
    // already picks the right card for account holders and visitors alike.
    { path: '/profile', component: () => import('./views/ProfileView.vue') },
    {
        path: '/admin',
        component: () => import('./layouts/AdminLayout.vue'),
        redirect: '/admin/groups',
        meta: { requiresAuth: true, requiresAdmin: true },
        children: [
            { path: 'groups', component: () => import('./views/GroupAdminView.vue') },
            { path: 'users', component: () => import('./views/admin/UsersAdminView.vue') },
            {
                path: 'discord-mappings',
                component: () => import('./views/admin/DiscordMappingsAdminView.vue'),
            },
        ],
    },
]

export function registerGuards(router: Router) {
    router.beforeEach((to) => {
        const auth = useAuthStore()

        if (to.path === '/login') {
            if (auth.isAuthenticated && auth.isApproved) return '/'
            return true
        }

        if (to.path === '/pending' || to.path === '/auth/callback') return true

        if (to.meta.requiresAuth && !auth.isAuthenticated) return '/login'

        if (
            auth.isAuthenticated &&
            (auth.isPending || auth.isRejected) &&
            !auth.isAdmin &&
            to.path !== '/pending'
        )
            return '/pending'

        if (to.meta.requiresAdmin && !auth.isAdmin) return '/'

        return true
    })
}
