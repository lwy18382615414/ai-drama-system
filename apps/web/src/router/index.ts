import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import WorkbenchLayout from '@/layouts/WorkbenchLayout.vue'

/**
 * The 8 workbench pages plus a catch-all. Project-scoped pages render inside the
 * WorkbenchLayout shell (sidebar + topbar). The projects list is the entry point.
 */
const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: WorkbenchLayout,
    children: [
      {
        path: '',
        name: 'projects',
        component: () => import('@/pages/ProjectsPage.vue'),
        meta: { title: '项目列表' },
      },
      {
        path: 'projects/new',
        name: 'project-new',
        component: () => import('@/pages/ProjectCreateWizardPage.vue'),
        meta: { title: '新建项目' },
      },
      {
        path: 'projects/:id',
        name: 'project-overview',
        component: () => import('@/pages/ProjectOverviewPage.vue'),
        meta: { title: '项目概览', step: 'overview' },
      },
      {
        path: 'projects/:id/novel',
        name: 'novel',
        component: () => import('@/pages/NovelImportPage.vue'),
        meta: { title: '小说与事件', step: 'novel' },
      },
      {
        path: 'projects/:id/novel/import',
        name: 'novel-import',
        component: () => import('@/pages/NovelImportWizardPage.vue'),
        meta: { title: '导入章节', step: 'novel' },
      },
      {
        path: 'projects/:id/episodes',
        name: 'episodes',
        component: () => import('@/pages/EpisodePlanPage.vue'),
        meta: { title: '剧集规划', step: 'episodes' },
      },
      {
        path: 'projects/:id/episodes/:episodeId/script',
        name: 'script',
        component: () => import('@/pages/ScriptEditorPage.vue'),
        meta: { title: '剧本编辑', step: 'script' },
      },
      {
        path: 'projects/:id/assets',
        name: 'assets',
        component: () => import('@/pages/AssetsPage.vue'),
        meta: { title: '角色 / 场景 / 道具', step: 'assets' },
      },
      {
        path: 'projects/:id/episodes/:episodeId/storyboards',
        name: 'storyboards',
        component: () => import('@/pages/StoryboardPage.vue'),
        meta: { title: '分镜工作台', step: 'storyboard' },
      },
      {
        path: 'projects/:id/characters/:characterId/image',
        name: 'character-image',
        component: () => import('@/pages/CharacterImagePage.vue'),
        meta: { title: '角色参考图', step: 'image' },
      },
    ],
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
