<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { episodes, getProject } from '@/mock'

const route = useRoute()

/** Current project id from the route params, when the route is project-scoped. */
const projectId = computed(() => (route.params.id as string | undefined) ?? null)
const project = computed(() => (projectId.value ? getProject(projectId.value) : undefined))

/** A representative episode so episode-scoped nav links have a target in the skeleton. */
const firstEpisodeId = computed(() => {
  if (!projectId.value) return undefined
  return episodes.find((e) => e.projectId === projectId.value)?.id
})
const firstCharacterId = 'ch1'

const nav = computed(() => {
  const pid = projectId.value
  if (!pid) return []
  const epId = firstEpisodeId.value
  return [
    { icon: '🏠', label: '项目概览', to: { name: 'project-overview', params: { id: pid } } },
    { icon: '📖', label: '小说与事件', to: { name: 'novel', params: { id: pid } } },
    { icon: '🎬', label: '剧集规划', to: { name: 'episodes', params: { id: pid } } },
    {
      icon: '📝',
      label: '剧本编辑',
      to: epId ? { name: 'script', params: { id: pid, episodeId: epId } } : { name: 'episodes', params: { id: pid } },
    },
    { icon: '🎭', label: '角色/场景/道具', to: { name: 'assets', params: { id: pid } } },
    {
      icon: '🎞️',
      label: '分镜工作台',
      to: epId
        ? { name: 'storyboards', params: { id: pid, episodeId: epId } }
        : { name: 'episodes', params: { id: pid } },
    },
    {
      icon: '🖼️',
      label: '角色参考图',
      to: { name: 'character-image', params: { id: pid, characterId: firstCharacterId } },
    },
  ]
})

const pageTitle = computed(() => (route.meta.title as string | undefined) ?? '')
</script>

<template>
  <div class="sf-shell">
    <aside class="sf-sidebar">
      <RouterLink to="/" class="sf-brand">
        <div class="sf-brand__mark">🎬</div>
        <div>
          <div class="sf-brand__name">AI 短剧工作台</div>
          <div class="sf-brand__sub">StoryFrame Studio</div>
        </div>
      </RouterLink>

      <nav class="sf-nav">
        <RouterLink
          to="/"
          class="sf-nav__item"
          :class="{ 'is-active': route.name === 'projects' }"
        >
          <span class="sf-nav__icon">📁</span> 全部项目
        </RouterLink>

        <template v-if="project">
          <div class="sf-nav__section">{{ project.title }}</div>
          <RouterLink
            v-for="item in nav"
            :key="item.label"
            :to="item.to"
            class="sf-nav__item"
            active-class="is-active"
          >
            <span class="sf-nav__icon">{{ item.icon }}</span> {{ item.label }}
          </RouterLink>
        </template>
        <template v-else>
          <div class="sf-nav__section">开始</div>
          <div class="sf-nav__item sf-faint">选择一个项目以查看工作流</div>
        </template>
      </nav>
    </aside>

    <div class="sf-main">
      <header class="sf-topbar">
        <div class="sf-breadcrumb">
          <RouterLink to="/">项目</RouterLink>
          <template v-if="project">
            <span class="sf-breadcrumb__sep">/</span>
            <RouterLink :to="{ name: 'project-overview', params: { id: project.id } }">
              {{ project.title }}
            </RouterLink>
          </template>
          <template v-if="pageTitle">
            <span class="sf-breadcrumb__sep">/</span>
            <span class="sf-breadcrumb__current">{{ pageTitle }}</span>
          </template>
        </div>
        <div class="sf-topbar__actions">
          <span class="sf-badge sf-badge--generating">演示 · 静态数据</span>
        </div>
      </header>

      <main class="sf-content">
        <div class="sf-content__inner">
          <RouterView />
        </div>
      </main>
    </div>
  </div>
</template>
