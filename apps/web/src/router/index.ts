import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

/**
 * Route tree — mirrors the information architecture in frontend-design.md §4.
 * Paths are English; nav labels (in the shells) are Chinese.
 *
 *   /                                  项目列表
 *   /projects/:projectId               工作台外壳 (WorkbenchLayout)
 *     ├─ chapters / batches / episodes / assets / settings
 *     └─ assets/characters/:id, assets/scenes/:id   (角色/场景详情页；道具用抽屉)
 *   /episodes/:episodeId               集工作区外壳 (EpisodeWorkspaceLayout)
 *     └─ script / assets / storyboard / images       (四个 tab = 嵌套子路由)
 */
const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'projects',
    component: () => import('@/views/ProjectListView.vue'),
  },
  {
    path: '/projects/:projectId',
    component: () => import('@/layouts/WorkbenchLayout.vue'),
    // Default to the pipeline board — the core page (§5.1).
    redirect: (to) => ({ name: 'episodes', params: to.params }),
    children: [
      {
        path: 'chapters',
        name: 'chapters',
        component: () => import('@/views/workbench/ChaptersView.vue'),
      },
      {
        path: 'batches',
        name: 'batches',
        component: () => import('@/views/workbench/BatchesView.vue'),
      },
      {
        path: 'episodes',
        name: 'episodes',
        component: () => import('@/views/workbench/PipelineBoardView.vue'),
      },
      {
        path: 'assets',
        name: 'assets',
        component: () => import('@/views/workbench/AssetsView.vue'),
      },
      {
        path: 'assets/characters/:characterId',
        name: 'character-detail',
        component: () => import('@/views/workbench/CharacterDetailView.vue'),
      },
      {
        path: 'assets/scenes/:sceneId',
        name: 'scene-detail',
        component: () => import('@/views/workbench/SceneDetailView.vue'),
      },
      {
        path: 'settings',
        name: 'settings',
        component: () => import('@/views/workbench/SettingsView.vue'),
      },
    ],
  },
  {
    path: '/episodes/:episodeId',
    component: () => import('@/layouts/EpisodeWorkspaceLayout.vue'),
    redirect: (to) => ({ name: 'episode-script', params: to.params }),
    children: [
      {
        path: 'script',
        name: 'episode-script',
        component: () => import('@/views/episode/ScriptTab.vue'),
      },
      {
        path: 'assets',
        name: 'episode-assets',
        component: () => import('@/views/episode/AssetsTab.vue'),
      },
      {
        path: 'storyboard',
        name: 'episode-storyboard',
        component: () => import('@/views/episode/StoryboardTab.vue'),
      },
      {
        path: 'images',
        name: 'episode-images',
        component: () => import('@/views/episode/ImagesTab.vue'),
      },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/NotFoundView.vue'),
  },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
