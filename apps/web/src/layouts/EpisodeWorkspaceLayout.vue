<template>
  <div class="workspace">
    <header class="topbar">
      <button class="back" @click="goBack">← 返回</button>
      <div class="title">集 {{ episodeId }}</div>
      <div class="stages">
        <span v-for="tab in tabs" :key="tab.name" class="stage-pill">{{ tab.label }}</span>
      </div>
    </header>

    <div class="body">
      <aside class="stage-nav">
        <RouterLink
          v-for="tab in tabs"
          :key="tab.name"
          :to="{ name: tab.name, params: { episodeId } }"
          class="stage-nav-item"
          active-class="stage-nav-item--active"
        >
          {{ tab.label }}
        </RouterLink>
      </aside>
      <main class="content">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

// 集工作区外壳：56px 顶栏（返回 + 集名 + 六阶段 mini 胶囊）+ 232px 左侧阶段导航。
// frontend-design.md §5.2 / README §5。四个阶段 tab 为嵌套子路由。
const route = useRoute()
const router = useRouter()
const episodeId = computed(() => String(route.params.episodeId ?? ''))

const tabs = [
  { name: 'episode-script', label: '剧本' },
  { name: 'episode-assets', label: '资产' },
  { name: 'episode-storyboard', label: '分镜' },
  { name: 'episode-images', label: '图片' },
]

function goBack() {
  router.back()
}
</script>

<style scoped>
.workspace {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.topbar {
  height: 56px;
  flex: 0 0 56px;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 20px;
  background: #fff;
  border-bottom: 1px solid #e8eaed;
}
.back {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  color: #5b6169;
}
.title {
  font-size: 15px;
  font-weight: 600;
  color: #1f2225;
}
.stages {
  display: flex;
  gap: 6px;
  margin-left: auto;
}
.stage-pill {
  font-size: 11px;
  color: #8a9099;
  padding: 3px 8px;
  border-radius: 10px;
  background: #f7f9fa;
}
.body {
  flex: 1 1 auto;
  display: flex;
  min-height: 0;
}
.stage-nav {
  width: 232px;
  flex: 0 0 232px;
  background: #fff;
  border-right: 1px solid #e4e7eb;
  padding: 12px 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.stage-nav-item {
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 13px;
  color: #5b6169;
}
.stage-nav-item:hover {
  background: #f2faf5;
}
.stage-nav-item--active {
  background: #e7f5ee;
  color: #18a058;
  font-weight: 600;
}
.content {
  flex: 1 1 auto;
  overflow: auto;
  padding: 24px;
  min-width: 0;
}
</style>
