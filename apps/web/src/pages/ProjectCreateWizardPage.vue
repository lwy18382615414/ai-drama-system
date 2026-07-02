<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  createProjectFromNovel,
  updateProject,
  type NovelMeta,
  type NovelSource,
} from '@/api/projects'
import { getGenerationTask, type GenerationTask } from '@/api/generationTasks'
import { getApiErrorMessage } from '@/api/client'
import { useTaskPolling } from '@/composables/useTaskPolling'
import NovelSourceInput, { type NovelPreviewedPayload } from '@/components/NovelSourceInput.vue'
import ChapterPreviewTable, { type PreviewRow } from '@/components/ChapterPreviewTable.vue'
import PanelCard from '@/components/PanelCard.vue'

const message = useMessage()
const router = useRouter()

const step = ref<'source' | 'preview' | 'confirm'>('source')
const source = ref<NovelSource>('paste')
const novelMeta = ref<NovelMeta | null>(null)
const previewRows = ref<PreviewRow[]>([])
const creating = ref(false)
const saving = ref(false)

const projectId = ref('')
const form = ref({
  title: '',
  description: '',
  genre: '',
  visualStyle: '',
})

function onPreviewed(payload: NovelPreviewedPayload) {
  source.value = payload.source
  novelMeta.value = payload.meta
  previewRows.value = payload.chapters.map((chapter) => ({
    ...chapter,
    include: true,
    editableTitle: chapter.title ?? '',
  }))
  step.value = 'preview'
}

interface ProjectProfileSuggestion {
  title?: string
  description?: string
  genre?: string
  visualStyle?: string
}

function applyProfileSuggestion(task: GenerationTask) {
  if (!task.outputJson) return
  try {
    const profile = JSON.parse(task.outputJson) as ProjectProfileSuggestion
    // AI 建议只填充仍是初始值的字段，不覆盖用户已手动修改的内容。
    if (profile.title && form.value.title === initialDraftTitle.value) form.value.title = profile.title
    if (profile.description && !form.value.description) form.value.description = profile.description
    if (profile.genre && !form.value.genre) form.value.genre = profile.genre
    if (profile.visualStyle && !form.value.visualStyle) form.value.visualStyle = profile.visualStyle
  } catch {
    message.warning('AI 分析结果解析失败，请手动填写项目信息')
  }
}

const initialDraftTitle = ref('')

const {
  start: startPolling,
  isPolling: analyzing,
  error: analyzeError,
} = useTaskPolling<GenerationTask>({
  fetchStatus: getGenerationTask,
  isDone: (task) => task.status === 'completed',
  isFailed: (task) => task.status === 'failed',
  getErrorMessage: (task) => task.errorMessage,
  onDone: (task) => {
    applyProfileSuggestion(task)
    message.success('AI 已根据小说内容生成项目信息，请确认或修改')
  },
  onFailed: () => {
    message.warning('AI 分析失败，请手动填写项目信息')
  },
})

async function create() {
  const chapters = previewRows.value
    .filter((row) => row.include)
    .map((row) => ({
      title: row.editableTitle.trim() || null,
      content: row.content,
    }))

  if (!chapters.length) {
    message.warning('请至少勾选一章')
    return
  }

  creating.value = true
  try {
    const result = await createProjectFromNovel({
      source: source.value,
      chapters,
      novelMeta: novelMeta.value ?? undefined,
    })
    projectId.value = result.project.id
    initialDraftTitle.value = result.project.title
    form.value.title = result.project.title
    step.value = 'confirm'
    startPolling(result.taskId)
  } catch (error) {
    message.error(getApiErrorMessage(error))
  } finally {
    creating.value = false
  }
}

async function finish() {
  if (!form.value.title.trim()) {
    message.warning('请填写项目标题')
    return
  }

  saving.value = true
  try {
    await updateProject(projectId.value, {
      title: form.value.title.trim(),
      description: form.value.description.trim() || null,
      ...(form.value.genre.trim() ? { genre: form.value.genre.trim() } : {}),
      ...(form.value.visualStyle.trim() ? { visualStyle: form.value.visualStyle.trim() } : {}),
    })
    message.success('项目创建完成')
    void router.push({ name: 'project-overview', params: { id: projectId.value } })
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
        <h1 class="sf-page-title">新建项目</h1>
        <p class="sf-page-desc">上传或粘贴小说，AI 将自动解析章节并生成项目信息。</p>
      </div>
    </div>

    <PanelCard v-if="step === 'source'" title="第 1 步 · 导入小说" framed>
      <NovelSourceInput @previewed="onPreviewed" />
    </PanelCard>

    <PanelCard v-else-if="step === 'preview'" title="第 2 步 · 确认章节" framed>
      <ChapterPreviewTable :rows="previewRows" />
      <div class="sf-row sf-mt-16" style="justify-content: flex-end; gap: 8px">
        <n-button :disabled="creating" @click="step = 'source'">上一步</n-button>
        <n-button type="primary" :loading="creating" @click="create">创建项目</n-button>
      </div>
    </PanelCard>

    <PanelCard v-else title="第 3 步 · 确认项目信息" framed>
      <n-alert v-if="analyzing" type="info" class="sf-mb-16" :show-icon="true">
        AI 正在分析小说内容，稍后将自动填充下方表单；你也可以直接手动填写。
      </n-alert>
      <n-alert v-else-if="analyzeError" type="warning" class="sf-mb-16" :show-icon="true">
        AI 分析失败：{{ analyzeError }}。请手动填写项目信息。
      </n-alert>

      <n-spin :show="analyzing">
        <n-form label-placement="top">
          <n-form-item label="项目标题" required>
            <n-input v-model:value="form.title" placeholder="例如：午夜信号" />
          </n-form-item>
          <n-form-item label="简介描述">
            <n-input
              v-model:value="form.description"
              type="textarea"
              placeholder="故事梗概与核心冲突…"
              :autosize="{ minRows: 3, maxRows: 6 }"
            />
          </n-form-item>
          <n-form-item label="题材类型">
            <n-input v-model:value="form.genre" placeholder="例如：复仇 / 甜宠 / 悬疑" />
          </n-form-item>
          <n-form-item label="视觉风格">
            <n-input v-model:value="form.visualStyle" placeholder="例如：现代都市，冷色调电影感灯光" />
          </n-form-item>
        </n-form>
      </n-spin>

      <div class="sf-row sf-mt-16" style="justify-content: flex-end; gap: 8px">
        <n-button type="primary" :loading="saving" @click="finish">完成</n-button>
      </div>
    </PanelCard>
  </div>
</template>
