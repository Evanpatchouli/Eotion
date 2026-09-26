import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'

import WorkspaceLayout from './layouts/WorkspaceLayout.vue'
import WorkspaceView from './views/WorkspaceView.vue'

const devRoutes: RouteRecordRaw[] = import.meta.env.DEV
  ? [
      { path: '__dev/mobile-p1', name: 'mobile-p1', meta: { title: '移动端 P1 演示' }, component: () => import('./views/MobileP1DemoView.vue') },
      { path: '__dev/editor-p2', name: 'editor-p2', meta: { title: '编辑器 P2 演示' }, component: () => import('./views/EditorP2DemoView.vue') },
      { path: '__dev/storage-p3', name: 'storage-p3', meta: { title: '本地存储 P3 演示' }, component: () => import('./views/StorageP3DemoView.vue') },
    ]
  : []

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      component: WorkspaceLayout,
      children: [
        { path: '', name: 'workspace', component: WorkspaceView },
        ...devRoutes,
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
