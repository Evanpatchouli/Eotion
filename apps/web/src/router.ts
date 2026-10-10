import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'

import { useAuthStore } from './stores/auth'
import WorkspaceLayout from './layouts/WorkspaceLayout.vue'
import WorkspaceView from './views/WorkspaceView.vue'
import { safeProductReturnTo } from './settingsNavigation'

const devRoutes: RouteRecordRaw[] = import.meta.env.DEV
  ? [
      {
        path: '/__dev',
        component: WorkspaceLayout,
        redirect: { name: 'workspace' },
        children: [
          { path: 'workspace', name: 'workspace', component: WorkspaceView },
          { path: 'mobile-p1', name: 'mobile-p1', meta: { title: '移动端 P1 演示' }, component: () => import('./views/MobileP1DemoView.vue') },
          { path: 'editor-p2', name: 'editor-p2', meta: { title: '编辑器 P2 演示' }, component: () => import('./views/EditorP2DemoView.vue') },
          { path: 'storage-p3', name: 'storage-p3', meta: { title: '本地存储 P3 演示' }, component: () => import('./views/StorageP3DemoView.vue') },
        ],
      },
      {
        path: '/__dev/interaction-foundation',
        name: 'interaction-foundation',
        meta: { title: 'Interaction Foundation 展示' },
        component: () => import('./views/InteractionFoundationDemoView.vue'),
      },
      {
        path: '/__dev/ui-foundation',
        name: 'ui-foundation',
        meta: { title: 'UI Foundation 展示' },
        component: () => import('./views/UiFoundationDemoView.vue'),
      },
      {
        path: '/__dev/editor-foundation',
        name: 'editor-foundation',
        meta: { title: 'Editor Foundation 展示' },
        component: () => import('./views/EditorFoundationDemoView.vue'),
      },
    ]
  : []

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/app' },
    { path: '/login', name: 'login', component: () => import('./views/LoginView.vue') },
    { path: '/register', name: 'register', component: () => import('./views/RegisterView.vue') },
    {
      path: '/app',
      component: () => import('./layouts/ProductShell.vue'),
      meta: { requiresAuth: true },
      children: [
        { path: '', name: 'product-home', component: () => import('./views/WorkspaceHomeView.vue') },
        { path: ':workspaceId', name: 'product-workspace', component: () => import('./views/WorkspaceHomeView.vue') },
        { path: ':workspaceId/database/:databaseId', name: 'product-database', component: () => import('./views/DatabasePageView.vue') },
        { path: ':workspaceId/page/:pageId', name: 'product-page', component: () => import('./views/PageView.vue') },
      ],
    },
    {
      path: '/settings',
      component: () => import('./layouts/SettingsLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        { path: '', name: 'settings-index', component: () => import('./views/settings/SettingsIndexView.vue') },
        { path: 'profile', name: 'settings-profile', component: () => import('./views/settings/ProfileSettingsView.vue') },
        { path: 'appearance', name: 'settings-appearance', component: () => import('./views/settings/AppearanceSettingsView.vue') },
        { path: 'mcp', name: 'settings-mcp', component: () => import('./views/settings/McpSettingsView.vue') },
        { path: 'workspace/general', name: 'settings-workspace-general', component: () => import('./views/settings/WorkspaceGeneralSettingsView.vue') },
        { path: 'about', name: 'settings-about', component: () => import('./views/settings/AboutSettingsView.vue') },
      ],
    },
    ...devRoutes,
    { path: '/:pathMatch(.*)*', redirect: '/app' },
  ],
})

router.beforeEach(async (to) => {
  if (to.path.startsWith('/__dev')) return true

  const auth = useAuthStore()
  await auth.ensureSession()
  if (auth.restoreError) return true

  if ((to.name === 'login' || to.name === 'register') && auth.user) {
    if (to.name === 'register') return '/app'
    const redirect = to.query.redirect
    if (typeof redirect === 'string' && /^\/settings(?:\/(?:profile|appearance|mcp|about|workspace\/general))?$/.test(redirect.split('?', 1)[0] ?? '')) return redirect
    return safeProductReturnTo(redirect)
  }
  if (to.meta.requiresAuth && !auth.user) {
    return { name: 'login', query: { redirect: to.path.startsWith('/settings') ? to.fullPath : safeProductReturnTo(to.path) } }
  }
  return true
})
