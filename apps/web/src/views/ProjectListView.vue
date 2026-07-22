<template>
  <section class="project-list-page">
    <!-- Top header bar -->
    <header class="top-nav">
      <div class="brand">
        <div class="brand-square">漫</div>
        <span class="brand-text">AI 漫剧工作台</span>
      </div>
      <div class="nav-right">
        <div class="user-avatar" title="当前用户">木</div>
      </div>
    </header>

    <!-- Main content container -->
    <main class="main-body">
      <header class="head-bar">
        <div>
          <h1 class="title">项目</h1>
          <p class="subtitle">
            {{ projects ? `${projects.length} 个项目` : '加载中...' }}
            <template v-if="activeTaskProjectsCount > 0">
              · {{ activeTaskProjectsCount }} 个有活动任务
            </template>
          </p>
        </div>
        <button class="new-btn" @click="showCreateModal = true">新建项目</button>
      </header>

      <!-- Loading State -->
      <div v-if="isPending" class="state-container">
        <NSpin size="large" />
      </div>

      <!-- Error State -->
      <NResult
        v-else-if="isError"
        status="error"
        title="项目加载失败"
        :description="error?.message ?? '请检查网络连接或稍后重试'"
        class="state-container"
      >
        <template #footer>
          <NButton type="primary" @click="() => refetch()">重新加载</NButton>
        </template>
      </NResult>

      <!-- Empty State -->
      <div v-else-if="!projects || projects.length === 0" class="empty-container">
        <NEmpty description="还没有项目，导入小说开始创建">
          <template #extra>
            <button class="new-btn" @click="showCreateModal = true">
              + 导入小说，新建项目
            </button>
          </template>
        </NEmpty>
      </div>

      <!-- Project Cards Grid -->
      <div v-else class="cards-grid">
        <RouterLink
          v-for="p in projects"
          :key="p.id"
          :to="{ name: 'episodes', params: { projectId: p.id } }"
          class="project-card"
        >
          <div class="cover-wrapper">
            <div class="cover-placeholder">
              <span class="cover-icon">🎬</span>
              <span class="cover-style">{{ p.visualStyle || '国漫二次元' }}</span>
            </div>
            <span class="status-badge" :class="`status--${p.status}`">
              {{ projectStatusLabel(p.status) }}
            </span>
          </div>

          <div class="card-body">
            <div class="card-title-row">
              <span class="card-name">{{ p.title }}</span>
              <span class="card-enter">进入 →</span>
            </div>
            <div class="card-summary">{{ summaryLine(p) }}</div>
          </div>
        </RouterLink>

        <!-- Create New Project Dashed Card -->
        <button class="card--dashed" @click="showCreateModal = true">
          <span class="plus-icon">+</span>
          <span class="dashed-text">导入小说，新建项目</span>
        </button>
      </div>
    </main>

    <!-- Create Project Wizard Modal -->
    <CreateProjectModal
      v-model:show="showCreateModal"
      @created="handleProjectCreated"
    />
  </section>
</template>

<script setup lang="ts">
import { RouterLink, useRouter } from 'vue-router'
import { NSpin, NResult, NButton, NEmpty, useMessage } from 'naive-ui'
import { ref, computed } from 'vue'
import { useProjectsQuery } from '@/composables/useProjects'
import { projectStatusLabel, relativeTime } from '@/utils/format'
import CreateProjectModal from '@/components/CreateProjectModal.vue'

// 项目列表（首页）。README §1。数据来自 GET /api/projects（vue-query）。
const router = useRouter()
const message = useMessage()
const { data: projects, isPending, isError, error, refetch } = useProjectsQuery()

const showCreateModal = ref(false)

const activeTaskProjectsCount = computed(() => {
  if (!projects.value) return 0
  return projects.value.filter((p) => p.status === 'planning' || p.status === 'active').length
})

function summaryLine(p: { episodeCount: number; chapterCount: number; updatedAt: string }): string {
  if (p.episodeCount > 0) {
    return `已规划 ${p.episodeCount} 集 · 更新于 ${relativeTime(p.updatedAt)}`
  }
  return `含 ${p.chapterCount} 章节 · 更新于 ${relativeTime(p.updatedAt)}`
}

function handleProjectCreated(createdProjectId: string) {
  showCreateModal.value = false
  message.success('项目创建成功！')
  refetch()
  router.push({ name: 'chapters', params: { projectId: createdProjectId } })
}
</script>

<style scoped>
.project-list-page {
  min-height: 100vh;
  background: #f5f7f9;
  color: #1f2225;
  display: flex;
  flex-direction: column;
}

.top-nav {
  height: 56px;
  background: #ffffff;
  border-bottom: 1px solid #e4e7eb;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  flex-shrink: 0;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

.brand-square {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: #18a058;
  color: #ffffff;
  font-size: 13px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.brand-text {
  font-size: 14px;
  font-weight: 600;
  color: #1f2225;
}

.nav-right {
  display: flex;
  align-items: center;
  gap: 14px;
}

.user-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #18a058;
  color: #ffffff;
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.main-body {
  flex: 1;
  padding: 28px 32px 56px;
  max-width: 1440px;
  width: 100%;
  margin: 0 auto;
}

.head-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #1f2225;
  letter-spacing: 0.2px;
}

.subtitle {
  font-size: 13px;
  color: #8a9099;
  margin: 4px 0 0;
}

.new-btn {
  border: none;
  background: #18a058;
  color: #ffffff;
  font-size: 13px;
  font-weight: 500;
  border-radius: 6px;
  padding: 8px 18px;
  cursor: pointer;
  transition: background 0.18s ease;
}

.new-btn:hover {
  background: #36ad6a;
}

.state-container {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 360px;
}

.empty-container {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 360px;
  background: #ffffff;
  border-radius: 14px;
  border: 1px solid #e4e7eb;
}

.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 18px;
}

.project-card {
  position: relative;
  background: #ffffff;
  border: 1px solid #e4e7eb;
  border-radius: 14px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  height: 250px;
  transition: box-shadow 0.18s ease, transform 0.18s ease, border-color 0.18s ease;
  text-decoration: none;
}

.project-card:hover {
  border-color: #c3e6d2;
  box-shadow: 0 10px 28px rgba(31, 34, 37, 0.1);
  transform: translateY(-2px);
}

.project-card:hover .card-name {
  color: #18a058;
}

.cover-wrapper {
  position: relative;
  height: 172px;
  background: #eef1f3;
  overflow: hidden;
}

.cover-placeholder {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #eef1f4 0%, #e2e7ec 100%);
  color: #8a9099;
  gap: 6px;
}

.cover-icon {
  font-size: 32px;
  opacity: 0.7;
}

.cover-style {
  font-size: 11px;
  background: rgba(0, 0, 0, 0.05);
  padding: 2px 8px;
  border-radius: 4px;
  color: #5b6169;
}

.status-badge {
  position: absolute;
  top: 12px;
  left: 12px;
  font-size: 11px;
  border-radius: 10px;
  padding: 2px 10px;
  background: rgba(255, 255, 255, 0.92);
  color: #5b6169;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
  font-weight: 500;
}

.status-badge.status--planning,
.status-badge.status--active {
  color: #18a058;
}

.card-body {
  padding: 16px 18px 18px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  flex: 1;
}

.card-title-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.card-name {
  font-size: 16px;
  font-weight: 600;
  color: #1f2225;
  letter-spacing: 0.2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 0.18s ease;
}

.card-enter {
  font-size: 12px;
  color: #a0a6ad;
  flex-shrink: 0;
}

.card-summary {
  font-size: 12px;
  color: #a0a6ad;
  margin-top: 6px;
}

.card--dashed {
  border: 1.5px dashed #d5d9dd;
  background: transparent;
  border-radius: 14px;
  height: 250px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  cursor: pointer;
  color: #8a9099;
  font-family: inherit;
  transition: all 0.18s ease;
}

.card--dashed:hover {
  border-color: #18a058;
  color: #18a058;
  background: rgba(24, 160, 88, 0.02);
}

.plus-icon {
  font-size: 28px;
  font-weight: 300;
  line-height: 1;
}

.dashed-text {
  font-size: 13px;
  font-weight: 500;
}
</style>
