<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useProjectQuery } from '@/composables/useProjects'

// 项目工作台外壳：208px 侧边栏 + 52px 顶栏，所有项目内页面共用。
// frontend-design.md §4 / README §2。导航为真实 router-link，激活态高亮。
const route = useRoute()
const projectId = computed(() => String(route.params.projectId ?? ''))

// 面包屑显示项目名称；加载中或缺失时回退到项目 ID。
const { data: project } = useProjectQuery(projectId)
const projectName = computed(() => project.value?.title || `项目 ${projectId.value}`)

const navItems = [
  { name: 'chapters', label: '章节与事件' },
  { name: 'batches', label: '分批规划' },
  { name: 'episodes', label: '集列表 · 管线看板' },
  { name: 'assets', label: '资产库' },
  { name: 'settings', label: '设置与费用' },
]
</script>

<template>
  <div class="workbench">
    <aside class="sidebar">
      <RouterLink :to="{ name: 'projects' }" class="brand">
        <span class="brand-square" />
        <span class="brand-text">AI 漫剧工作台</span>
      </RouterLink>
      <nav class="nav">
        <RouterLink
          v-for="item in navItems"
          :key="item.name"
          :to="{ name: item.name, params: { projectId } }"
          class="nav-item"
          active-class="nav-item--active"
        >
          {{ item.label }}
        </RouterLink>
      </nav>
    </aside>

    <div class="main">
      <header class="topbar">
        <div class="breadcrumb">{{ projectName }}</div>
        <div class="topbar-right">
          <span class="sse-dot" title="实时连接" />
        </div>
      </header>
      <main class="content">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<style scoped>
.workbench {
  display: flex;
  height: 100%;
}
.sidebar {
  width: 208px;
  flex: 0 0 208px;
  background: #fff;
  border-right: 1px solid #e4e7eb;
  display: flex;
  flex-direction: column;
  padding: 12px 10px;
  gap: 8px;
}
.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  font-size: 14px;
  font-weight: 600;
  color: #1f2225;
}
.brand-square {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: #18a058;
}
.nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 8px;
}
.nav-item {
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 13px;
  color: #5b6169;
}
.nav-item:hover {
  background: #f2faf5;
}
.nav-item--active {
  background: #e7f5ee;
  color: #18a058;
  font-weight: 600;
}
.main {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.topbar {
  height: 52px;
  flex: 0 0 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  background: #fff;
  border-bottom: 1px solid #e8eaed;
}
.breadcrumb {
  font-size: 13px;
  color: #5b6169;
}
.sse-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #18a058;
}
.content {
  flex: 1 1 auto;
  overflow: auto;
  padding: 24px;
}
</style>
