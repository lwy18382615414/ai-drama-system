<script setup lang="ts">
import { h, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import type { DataTableColumns } from 'naive-ui'
import { listEpisodes, type Episode } from '@/api/episodes'
import type { ProjectDetail } from '@/api/projects'
import { getApiErrorMessage } from '@/api/client'
import { toPipelineStatus } from '@/utils/status'
import { useProject } from '@/composables/useProject'
import PipelineSteps from '@/components/PipelineSteps.vue'
import StatCard from '@/components/StatCard.vue'
import PanelCard from '@/components/PanelCard.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import EmptyState from '@/components/EmptyState.vue'
import EditProjectModal from '@/components/EditProjectModal.vue'

const message = useMessage()
const { projectId, project } = useProject()
const projectEpisodes = ref<Episode[]>([])
const showEditModal = ref(false)

async function loadEpisodes() {
  if (!projectId.value) return
  try {
    projectEpisodes.value = await listEpisodes(projectId.value)
  } catch (error) {
    message.error(getApiErrorMessage(error))
  }
}

onMounted(loadEpisodes)
watch(projectId, loadEpisodes)

function onProjectSaved(updated: ProjectDetail) {
  project.value = updated
}

const episodeColumns: DataTableColumns<Episode> = [
  { title: '集数', key: 'episodeNo', render: (ep) => h('strong', `第 ${ep.episodeNo} 集`) },
  { title: '标题', key: 'title', render: (ep) => h('strong', ep.title ?? '') },
  { title: '梗概', key: 'summary' },
  { title: '状态', key: 'status', render: (ep) => h(StatusBadge, { status: toPipelineStatus(ep.status) }) },
  {
    title: '',
    key: 'actions',
    render: (ep) =>
      h(
        RouterLink,
        { to: { name: 'storyboards', params: { id: projectId.value, episodeId: ep.id } }, class: 'sf-muted' },
        { default: () => '分镜 →' },
      ),
  },
]
</script>

<template>
  <div v-if="project">
    <div class="sf-page-head">
      <div>
        <h1 class="sf-page-title">{{ project.title }}</h1>
        <p class="sf-page-desc">{{ project.description }}</p>
      </div>
      <div class="sf-row" style="align-items: center">
        <n-button size="small" secondary @click="showEditModal = true">编辑信息</n-button>
        <StatusBadge :status="toPipelineStatus(project.status)" />
      </div>
    </div>

    <!-- No active-key: on the overview page the strip is a workflow map, not a location tab. -->
    <PipelineSteps />

    <div class="sf-grid sf-grid--stats sf-mb-16">
      <StatCard label="剧集" :value="project.episodeCount" hint="已规划" icon="🎬" />
      <StatCard label="角色" :value="project.characterCount" hint="已提取" icon="🎭" />
      <StatCard label="场景" :value="project.sceneCount" icon="🏞️" />
      <StatCard label="分镜" :value="project.storyboardCount" icon="🎞️" />
      <StatCard label="参考图进度" :value="project.imageCompletion + '%'" hint="角色/场景/分镜图" icon="🖼️" />
    </div>

    <PanelCard title="剧集" framed>
      <template #actions>
        <RouterLink :to="{ name: 'episodes', params: { id: projectId } }">
          <n-button size="small" quaternary>剧集规划</n-button>
        </RouterLink>
      </template>

      <EmptyState v-if="!projectEpisodes.length" icon="🎬" title="尚未规划剧集" desc="导入小说并提取事件后即可规划剧集。" />
      <n-data-table v-else :columns="episodeColumns" :data="projectEpisodes" :bordered="false" :single-line="false" />
    </PanelCard>

    <EditProjectModal v-model:show="showEditModal" :project="project" @saved="onProjectSaved" />
  </div>

  <EmptyState v-else icon="🚫" title="项目不存在" desc="请返回项目列表重新选择。" />
</template>
