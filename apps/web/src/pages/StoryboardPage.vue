<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { generateStoryboards, getEpisodeStoryboards, type Storyboard } from '@/api/storyboards'
import { listProjectCharacters, listProjectScenes } from '@/api/assets'
import { getGenerationTask, type GenerationTask } from '@/api/generationTasks'
import { getApiErrorMessage } from '@/api/client'
import { toPipelineStatus } from '@/utils/status'
import { useTaskPolling } from '@/composables/useTaskPolling'
import { useProject } from '@/composables/useProject'
import PipelineSteps from '@/components/PipelineSteps.vue'
import PanelCard from '@/components/PanelCard.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import EmptyState from '@/components/EmptyState.vue'

const message = useMessage()
const { projectId } = useProject()
const route = useRoute()
const episodeId = computed(() => route.params.episodeId as string)

const episode = ref<{ id: string; episodeNo: number; title: string | null } | null>(null)
const shots = ref<Storyboard[]>([])
const loading = ref(false)
const sceneNames = ref(new Map<string, string>())
const characterNames = ref(new Map<string, string>())

function sceneName(sceneId: string | null) {
  return sceneId ? (sceneNames.value.get(sceneId) ?? sceneId) : null
}

function characterName(characterId: string) {
  return characterNames.value.get(characterId) ?? characterId
}

async function load() {
  if (!episodeId.value) return
  loading.value = true
  try {
    const [result, scenes, characters] = await Promise.all([
      getEpisodeStoryboards(episodeId.value),
      listProjectScenes(projectId.value),
      listProjectCharacters(projectId.value),
    ])
    episode.value = result.episode
    shots.value = result.storyboards
    sceneNames.value = new Map(scenes.map((s) => [s.id, s.name]))
    characterNames.value = new Map(characters.map((c) => [c.id, c.name]))
  } catch (error) {
    message.error(getApiErrorMessage(error))
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(episodeId, load)

const { start: startPolling, isPolling: generating } = useTaskPolling<GenerationTask>({
  fetchStatus: getGenerationTask,
  isDone: (t) => t.status === 'completed',
  isFailed: (t) => t.status === 'failed',
  getErrorMessage: (t) => t.errorMessage,
  onDone: () => {
    message.success('分镜生成完成')
    void load()
  },
  onFailed: (t) => message.error(t.errorMessage ?? '分镜生成失败'),
})

async function regenerate() {
  try {
    const { taskId } = await generateStoryboards(episodeId.value, { force: true })
    startPolling(taskId)
  } catch (error) {
    message.error(getApiErrorMessage(error))
  }
}
</script>

<template>
  <div>
    <div class="sf-page-head">
      <div>
        <h1 class="sf-page-title">分镜工作台</h1>
        <p class="sf-page-desc">
          {{ episode ? `第 ${episode.episodeNo} 集 · ${episode.title}` : '剧集' }} · 逐镜头分镜与提示词
        </p>
      </div>
      <n-button type="primary" :loading="generating" @click="regenerate">🔁 重新生成分镜</n-button>
    </div>

    <PipelineSteps active-key="storyboard" />

    <n-spin :show="loading">
    <EmptyState v-if="!shots.length" icon="🎞️" title="该集暂无分镜" desc="生成剧本并提取资产后即可生成分镜。" />

    <div v-else class="sf-grid" style="gap: 16px">
      <PanelCard v-for="shot in shots" :key="shot.id" :title="`镜头 ${shot.shotNo} · ${shot.shotType}`">
        <template #actions><StatusBadge :status="toPipelineStatus(shot.status)" /></template>

        <div class="sf-row" style="gap: 16px; align-items: flex-start">
          <div class="sf-thumb sf-thumb--wide" style="width: 200px; flex-shrink: 0">
            <span v-if="shot.firstFrameImageUrl">🖼️ 首帧</span>
            <span v-else>待生成</span>
          </div>

          <div style="min-width: 0; flex: 1">
            <p class="sf-mb-8">{{ shot.action }}</p>
            <div class="sf-row sf-wrap sf-mb-16">
              <span v-if="shot.sceneId" class="sf-tag">🏞️ {{ sceneName(shot.sceneId) }}</span>
              <span v-for="c in shot.characterIds" :key="c" class="sf-tag">🎭 {{ characterName(c) }}</span>
            </div>

            <div class="sf-field">
              <div class="sf-label">image_prompt</div>
              <div class="sf-mono sf-muted sf-notice">{{ shot.imagePrompt }}</div>
            </div>
            <div class="sf-field">
              <div class="sf-label">video_prompt（规划字段 · 未激活）</div>
              <div class="sf-mono sf-faint sf-notice" style="background: var(--sf-panel-2); border-color: var(--sf-border); color: var(--sf-text-dim)">
                {{ shot.videoPrompt }}
              </div>
            </div>
          </div>
        </div>
      </PanelCard>
    </div>
    </n-spin>
  </div>
</template>
