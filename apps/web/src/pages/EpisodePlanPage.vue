<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { listEpisodes, planEpisodes, type Episode } from '@/api/episodes'
import { getApiErrorMessage } from '@/api/client'
import { toPipelineStatus } from '@/utils/status'
import { useProject } from '@/composables/useProject'
import PipelineSteps from '@/components/PipelineSteps.vue'
import PanelCard from '@/components/PanelCard.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import MockButton from '@/components/MockButton.vue'
import EmptyState from '@/components/EmptyState.vue'

const message = useMessage()
const { projectId } = useProject()
const projectEpisodes = ref<Episode[]>([])
const loading = ref(false)
const planning = ref(false)

async function loadEpisodes() {
  if (!projectId.value) return
  loading.value = true
  try {
    projectEpisodes.value = await listEpisodes(projectId.value)
  } catch (error) {
    message.error(getApiErrorMessage(error))
  } finally {
    loading.value = false
  }
}

async function replan() {
  planning.value = true
  try {
    await planEpisodes(projectId.value)
    message.success('已开始规划剧集，请稍后刷新查看')
  } catch (error) {
    message.error(getApiErrorMessage(error))
  } finally {
    planning.value = false
  }
}

onMounted(loadEpisodes)
watch(projectId, loadEpisodes)
</script>

<template>
  <div>
    <div class="sf-page-head">
      <div>
        <h1 class="sf-page-title">剧集规划</h1>
        <p class="sf-page-desc">EpisodePlannerAgent 将小说事件分组为短剧剧集。</p>
      </div>
      <n-button type="primary" :loading="planning" @click="replan">🔁 重新规划剧集</n-button>
    </div>

    <PipelineSteps active-key="episodes" />

    <n-spin :show="loading">
      <EmptyState v-if="!loading && !projectEpisodes.length" icon="🎬" title="尚未规划剧集" desc="提取事件后点击“重新规划剧集”开始。" />
      <div v-else class="sf-grid sf-grid--2">
        <PanelCard v-for="ep in projectEpisodes" :key="ep.id" :title="`第 ${ep.episodeNo} 集 · ${ep.title}`">
          <template #actions>
            <StatusBadge :status="toPipelineStatus(ep.status)" />
          </template>

          <p class="sf-muted">{{ ep.summary }}</p>

          <div class="sf-row sf-mt-16 sf-gap-16">
            <RouterLink :to="{ name: 'script', params: { id: projectId, episodeId: ep.id } }">
              <MockButton label="剧本" size="sm" icon="📝" />
            </RouterLink>
            <RouterLink :to="{ name: 'storyboards', params: { id: projectId, episodeId: ep.id } }">
              <MockButton label="分镜" size="sm" icon="🎞️" />
            </RouterLink>
          </div>
        </PanelCard>
      </div>
    </n-spin>
  </div>
</template>
