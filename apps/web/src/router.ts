import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from './stores/auth.js'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', component: () => import('./views/LoginView.vue') },
    { path: '/pending', component: () => import('./views/PendingView.vue') },
    { path: '/auth/callback', component: () => import('./views/AuthCallbackView.vue') },
    { path: '/', component: () => import('./views/HomeView.vue') },
    { path: '/planning', component: () => import('./views/PlanningView.vue') },
    { path: '/planning/compare', component: () => import('./views/PlanningComparisonView.vue') },
    { path: '/teachers', component: () => import('./views/TeachersView.vue') },
    { path: '/rooms', component: () => import('./views/RoomsView.vue') },
    { path: '/profile', component: () => import('./views/ProfileView.vue'), meta: { requiresAuth: true } },
    {
      path: '/admin',
      component: () => import('./layouts/AdminLayout.vue'),
      redirect: '/admin/groups',
      meta: { requiresAuth: true, requiresAdmin: true },
      children: [
        { path: 'groups', component: () => import('./views/GroupAdminView.vue') },
        { path: 'users', component: () => import('./views/admin/UsersAdminView.vue') },
        { path: 'discord-mappings', component: () => import('./views/admin/DiscordMappingsAdminView.vue') },
      ],
    },
  ],
})

router.beforeEach((to) => {
  const auth = useAuthStore()

  if (to.path === '/login') {
    if (auth.isAuthenticated && auth.isApproved) return '/'
    return true
  }

  if (to.path === '/pending' || to.path === '/auth/callback') return true

  if (to.meta.requiresAuth && !auth.isAuthenticated) return '/login'

  if (auth.isAuthenticated && auth.isPending && to.path !== '/pending') return '/pending'

  if (to.meta.requiresAdmin && !auth.isAdmin) return '/'

  return true
})
