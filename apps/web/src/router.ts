import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'

import WorkspaceView from './views/WorkspaceView.vue'

const devRoutes: RouteRecordRaw[] = import.meta.env.DEV
  ? [{ path: '/__dev/mobile-p1', name: 'mobile-p1', component: () => import('./views/MobileP1DemoView.vue') }]
  : []

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'workspace', component: WorkspaceView },
    ...devRoutes,
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
