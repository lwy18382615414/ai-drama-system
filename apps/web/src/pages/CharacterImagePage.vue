<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { getCharacter, type Character } from '@/api/assets'
import { generateCharacterImage } from '@/api/characters'
import { getGenerationTask, type GenerationTask } from '@/api/generationTasks'
import { getApiErrorMessage } from '@/api/client'
import { toPipelineStatus } from '@/utils/status'
import type { PipelineStatus } from '@/types'
import { useTaskPolling } from '@/composables/useTaskPolling'
import { useProject } from '@/composables/useProject'
import PipelineSteps from '@/components/PipelineSteps.vue'
import PanelCard from '@/components/PanelCard.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import EmptyState from '@/components/EmptyState.vue'

const message = useMessage()
const { project } = useProject()
const route = useRoute()
const characterId = computed(() => route.params.characterId as string)
const character = ref<Character | null>(null)
const currentTask = ref<GenerationTask | null>(null)

async function loadCharacter() {
  if (!characterId.value) return
  try {
    character.value = await getCharacter(characterId.value)
  } catch (error) {
    character.value = null
    message.error(getApiErrorMessage(error))
  }
}

onMounted(loadCharacter)
watch(characterId, loadCharacter)

/** Built the same way the backend builds Phase 2B prompts: name/role/appearance/personality + visual style. */
const prompt = computed(() => {
  const c = character.value
  if (!c) return ''
  const style = project.value?.visualStyle ?? 'realistic'
  return `${c.name}, ${c.role}, ${c.appearance} ${c.personality} visual style: ${style}`
})

const { start: startPolling, isPolling: generating } = useTaskPolling<GenerationTask>({
  fetchStatus: getGenerationTask,
  isDone: (t) => t.status === 'completed',
  isFailed: (t) => t.status === 'failed',
  getErrorMessage: (t) => t.errorMessage,
  onDone: (t) => {
    currentTask.value = t
    message.success('参考图生成完成')
    void loadCharacter()
  },
  onFailed: (t) => {
    currentTask.value = t
    message.error(t.errorMessage ?? '参考图生成失败')
  },
})

async function generate(force: boolean) {
  try {
    const { taskId } = await generateCharacterImage(characterId.value, { force })
    currentTask.value = await getGenerationTask(taskId)
    startPolling(taskId)
  } catch (error) {
    message.error(getApiErrorMessage(error))
  }
}

const currentStatus = computed<PipelineStatus>(() => {
  if (character.value?.referenceImageUrl) return 'done'
  if (generating.value) return 'generating'
  if (currentTask.value) return toPipelineStatus(currentTask.value.status)
  return 'draft'
})
</script>

<template>
  <div v-if="character">
    <div class="sf-page-head">
      <div>
        <h1 class="sf-page-title">角色参考图 · {{ character.name }}</h1>
        <p class="sf-page-desc">Phase 2B：基于角色描述与项目视觉风格，通过 MockImageProvider 生成参考图。</p>
      </div>
      <div class="sf-row">
        <StatusBadge :status="currentStatus" />
        <n-button type="primary" :loading="generating" @click="generate(false)">✨ 生成参考图</n-button>
        <n-button :loading="generating" @click="generate(true)">🔁 强制重生成 (force)</n-button>
      </div>
    </div>

    <PipelineSteps active-key="image" />

    <div class="sf-grid sf-grid--2">
      <PanelCard title="参考图" framed>
        <div class="sf-thumb" style="max-width: 260px; margin: 0 auto">
          <span v-if="character.referenceImageUrl">🖼️ 已生成</span>
          <span v-else>尚未生成</span>
        </div>
      </PanelCard>

      <PanelCard title="角色设定与提示词">
        <div class="sf-field">
          <div class="sf-label">角色</div>
          <div>{{ character.name }} · <span class="sf-muted">{{ character.role }}</span></div>
        </div>
        <div class="sf-field">
          <div class="sf-label">外貌</div>
          <div class="sf-muted">{{ character.appearance }}</div>
        </div>
        <div class="sf-field">
          <div class="sf-label">性格</div>
          <div class="sf-muted">{{ character.personality }}</div>
        </div>
        <div class="sf-field">
          <div class="sf-label">合成提示词</div>
          <div class="sf-mono sf-notice">{{ prompt }}</div>
        </div>
      </PanelCard>
    </div>

    <PanelCard title="当前生成任务" class="sf-mt-16">
      <EmptyState v-if="!currentTask" icon="⏳" title="暂无生成任务" desc="点击“生成参考图”将创建一个图像生成任务。" />
      <div v-else class="sf-field">
        <div class="sf-row sf-row--between sf-mb-8">
          <span class="sf-mono">{{ currentTask.id }}</span>
          <StatusBadge :status="toPipelineStatus(currentTask.status)" />
        </div>
        <div class="sf-muted">创建于 {{ new Date(currentTask.createdAt).toLocaleString() }}</div>
        <div v-if="currentTask.errorMessage" class="sf-muted">错误：{{ currentTask.errorMessage }}</div>
      </div>
    </PanelCard>
  </div>

  <EmptyState v-else icon="🚫" title="角色不存在" desc="请返回资产页重新选择角色。" />
</template>
