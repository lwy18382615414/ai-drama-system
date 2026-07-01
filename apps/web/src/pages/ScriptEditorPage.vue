<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { generateScript, getEpisodeScript, updateScript, type Script } from '@/api/scripts'
import { listEpisodes, type Episode } from '@/api/episodes'
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

const episode = ref<Episode | null>(null)
const script = ref<Script | null>(null)
const draft = ref('')
const loading = ref(false)
const saving = ref(false)

watch(
  script,
  (s) => {
    draft.value = s?.content ?? ''
  },
  { immediate: true },
)

async function load() {
  if (!episodeId.value) return
  loading.value = true
  try {
    const [episodes, fetchedScript] = await Promise.all([
      listEpisodes(projectId.value),
      getEpisodeScript(episodeId.value),
    ])
    episode.value = episodes.find((ep) => ep.id === episodeId.value) ?? null
    script.value = fetchedScript
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
    message.success('剧本生成完成')
    void load()
  },
  onFailed: (t) => message.error(t.errorMessage ?? '剧本生成失败'),
})

async function regenerate() {
  try {
    const { taskId } = await generateScript(episodeId.value, { force: true })
    startPolling(taskId)
  } catch (error) {
    message.error(getApiErrorMessage(error))
  }
}

async function save() {
  if (!script.value) return
  saving.value = true
  try {
    script.value = await updateScript(script.value.id, { content: draft.value })
    message.success('已保存')
  } catch (error) {
    message.error(getApiErrorMessage(error))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <div class="sf-page-head">
      <div>
        <h1 class="sf-page-title">剧本编辑</h1>
        <p class="sf-page-desc">
          {{ episode ? `第 ${episode.episodeNo} 集 · ${episode.title}` : '剧集' }}
        </p>
      </div>
      <div class="sf-row">
        <StatusBadge v-if="script" :status="toPipelineStatus(script.status)" />
        <n-button :loading="generating" @click="regenerate">🔁 重新生成</n-button>
        <n-button type="primary" :loading="saving" :disabled="!script" @click="save">💾 保存</n-button>
      </div>
    </div>

    <PipelineSteps active-key="script" />

    <n-spin :show="loading">
      <EmptyState v-if="!script" icon="📝" title="尚未生成剧本" desc="点击“重新生成”开始生成剧本。" />
      <PanelCard v-else title="剧本正文" framed>
        <n-input v-model:value="draft" type="textarea" :autosize="{ minRows: 20 }" spellcheck="false" />
      </PanelCard>
    </n-spin>
  </div>
</template>
