<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { listProjects, type ProjectSummary } from '@/api/projects'
import { getApiErrorMessage } from '@/api/client'
import { toPipelineStatus } from '@/utils/status'
import StatusBadge from '@/components/StatusBadge.vue'
import ProgressBar from '@/components/ProgressBar.vue'
import EmptyState from '@/components/EmptyState.vue'
import CreateProjectModal from '@/components/CreateProjectModal.vue'

const message = useMessage()
const router = useRouter()
const projects = ref<ProjectSummary[]>([])
const loading = ref(false)
const showCreateModal = ref(false)

async function load() {
  loading.value = true
  try {
    projects.value = await listProjects()
  } catch (error) {
    message.error(getApiErrorMessage(error))
  } finally {
    loading.value = false
  }
}

function onCreated(project: ProjectSummary) {
  router.push({ name: 'project-overview', params: { id: project.id } })
}

onMounted(load)
</script>

<template>
  <div>
    <div class="sf-page-head">
      <div>
        <h1 class="sf-page-title">全部项目</h1>
        <p class="sf-page-desc">从小说到分镜，管理你的 AI 短剧生产流水线。</p>
      </div>
      <n-button type="primary" @click="showCreateModal = true">＋ 新建项目</n-button>
    </div>

    <n-spin :show="loading">
      <EmptyState v-if="!loading && !projects.length" icon="📁" title="暂无项目" desc="还没有创建任何项目。">
        <n-button type="primary" @click="showCreateModal = true">＋ 新建项目</n-button>
      </EmptyState>
      <div v-else class="sf-grid sf-grid--cards">
        <RouterLink
          v-for="p in projects"
          :key="p.id"
          :to="{ name: 'project-overview', params: { id: p.id } }"
          class="sf-card sf-card--hover"
        >
          <div class="sf-card__body">
            <div class="sf-row sf-row--between sf-mb-8">
              <h3 class="sf-card__title">{{ p.title }}</h3>
              <StatusBadge :status="toPipelineStatus(p.status)" />
            </div>
            <p class="sf-muted" style="min-height: 42px">{{ p.description }}</p>

            <div class="sf-row sf-wrap sf-mt-8">
              <span class="sf-tag">{{ p.genre }}</span>
              <span class="sf-tag">{{ p.visualStyle }}</span>
              <span class="sf-tag">{{ p.episodeDuration }}s / 集</span>
            </div>

            <div class="sf-row sf-row--between sf-mt-16" style="font-size: 12.5px">
              <span class="sf-faint">{{ p.episodeCount }} 集 · {{ p.characterCount }} 角色 · {{ p.storyboardCount }} 分镜</span>
              <span class="sf-muted">图像 {{ p.imageCompletion }}%</span>
            </div>
            <ProgressBar class="sf-mt-8" :value="p.imageCompletion" />
          </div>
        </RouterLink>
      </div>
    </n-spin>

    <CreateProjectModal v-model:show="showCreateModal" @created="onCreated" />
  </div>
</template>
