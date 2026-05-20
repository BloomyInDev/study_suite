import { createRouter, createWebHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: () => import('./views/HomeView.vue') },
    { path: '/planning', component: () => import('./views/PlanningView.vue') },
    { path: '/planning/compare', component: () => import('./views/PlanningComparisonView.vue') },
    { path: '/teachers', component: () => import('./views/TeachersView.vue') },
    { path: '/rooms', component: () => import('./views/RoomsView.vue') },
    { path: '/profile', component: () => import('./views/ProfileView.vue') },
    {
      path: '/admin',
      component: () => import('./layouts/AdminLayout.vue'),
      redirect: '/admin/groups',
      children: [
        { path: 'groups', component: () => import('./views/GroupAdminView.vue') },
      ],
    },
  ],
})
