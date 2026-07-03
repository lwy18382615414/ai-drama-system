import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

/**
 * Two routes only: the project list (the sole page outside a project) and the
 * workbench (the sole page inside one). Inside the workbench, mode switching
 * and selection replace route navigation entirely — context never resets —
 * so there are no nested per-mode routes; WorkbenchPage owns that state.
 */
const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'projects',
    component: () => import('@/pages/ProjectsPage.vue'),
    meta: { title: '项目列表' },
  },
  {
    path: '/projects/:id',
    name: 'workbench',
    component: () => import('@/pages/WorkbenchPage.vue'),
    meta: { title: '工作台' },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/pages/NotFoundPage.vue'),
  },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  },
})
