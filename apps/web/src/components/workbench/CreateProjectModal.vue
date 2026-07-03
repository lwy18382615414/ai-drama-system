<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  createProjectFromNovel,
  getProject,
  previewNovelFile,
  previewNovelText,
  updateProject,
  type NovelSource,
  type UpdateProjectInput,
} from '@/api/projects'
import { getApiErrorMessage } from '@/api/client'
import { getGenerationTask, type GenerationTask } from '@/api/generationTasks'
import { useTaskCenter } from '@/store/taskCenter'

const emit = defineEmits<{ close: [] }>()
const message = useMessage()
const router = useRouter()
const taskCenter = useTaskCenter()

const text = ref('')
const title = ref('')
const source = ref<NovelSource>('paste')
const file = ref<File | null>(null)
const fileName = ref('')
const dragOver = ref(false)
const creating = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)

const canSubmit = computed(() => (source.value === 'epub' ? !!file.value : text.value.trim().length > 0))

function decodeTxt(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    return new TextDecoder('gbk').decode(buffer)
  }
}

async function handleFile(f: File) {
  if (f.name.toLowerCase().endsWith('.epub')) {
    file.value = f
    text.value = ''
    source.value = 'epub'
  } else {
    const buffer = await f.arrayBuffer()
    text.value = decodeTxt(buffer)
    file.value = null
    source.value = 'txt'
  }
  fileName.value = f.name
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const f = input.files?.[0]
  input.value = ''
  if (f) void handleFile(f)
}

function onDrop(event: DragEvent) {
  dragOver.value = false
  const f = event.dataTransfer?.files?.[0]
  if (f) void handleFile(f)
}

function onTextInput() {
  if (source.value !== 'paste' && text.value.trim()) {
    source.value = 'paste'
    file.value = null
    fileName.value = ''
  }
}

/** Once the background project-profile analysis finishes, quietly fill in fields the user left untouched. */
function applyProfileWhenReady(projectId: string, taskId: string) {
  taskCenter.register(taskId, {
    label: 'AI 项目画像分析',
    scope: projectId,
    kind: 'project_profile',
    projectId,
    onDone: async () => {
      try {
        const task: GenerationTask = await getGenerationTask(taskId)
        if (!task.outputJson) return
        const profile = JSON.parse(task.outputJson) as {
          title?: string
          description?: string
          genre?: string
          visualStyle?: string
        }
        const current = await getProject(projectId)
        const patch: UpdateProjectInput = {}
        if (profile.title && current.title === '未命名项目') patch.title = profile.title
        if (profile.description && !current.description) patch.description = profile.description
        if (profile.genre && current.genre === 'drama') patch.genre = profile.genre
        if (profile.visualStyle && current.visualStyle === 'realistic') patch.visualStyle = profile.visualStyle
        if (Object.keys(patch).length > 0) await updateProject(projectId, patch)
        message.success('AI 已根据小说内容生成项目信息，可在项目下拉中查看')
      } catch {
        // Best-effort background enrichment — a parse/patch failure here shouldn't surface to the user.
      }
    },
  })
}

async function doCreate() {
  if (!canSubmit.value) {
    message.warning('请先粘贴小说文本或选择 .txt / .epub 文件')
    return
  }

  creating.value = true
  try {
    const preview =
      source.value === 'epub' && file.value
        ? await previewNovelFile(file.value)
        : await previewNovelText(text.value)

    if (!preview.chapters.length) {
      message.warning('未能从内容中切分出章节，请检查文本或文件')
      return
    }

    const result = await createProjectFromNovel({
      title: title.value.trim() || undefined,
      source: source.value,
      chapters: preview.chapters.map((c) => ({ title: c.title, content: c.content })),
      novelMeta: preview.meta ?? undefined,
    })

    applyProfileWhenReady(result.project.id, result.taskId)
    emit('close')
    void router.push({ name: 'workbench', params: { id: result.project.id } })
  } catch (error) {
    message.error(getApiErrorMessage(error))
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <div class="wb-modal" @click.self="emit('close')">
    <div class="wb-msheet">
      <p class="wb-mtitle">新建项目</p>
      <p class="wb-mhint">粘贴小说正文，或拖入文件。章节拆分与项目画像在后台完成，创建后立即进入工作台。</p>

      <div
        class="wb-drop"
        :class="{ drag: dragOver }"
        @click="fileInputRef?.click()"
        @dragover.prevent="dragOver = true"
        @dragleave.prevent="dragOver = false"
        @drop.prevent="onDrop"
      >
        拖入 <b>.txt / .epub</b> 到此处，或 <b>点击选择文件</b><br />
        <span style="font-size: 11.5px">{{ fileName || '也可直接把正文粘贴到下方' }}</span>
        <input ref="fileInputRef" type="file" accept=".txt,.epub" style="display: none" @change="onFileChange" />
      </div>

      <div class="wb-field">
        <label>正文（可粘贴）</label>
        <textarea
          v-model="text"
          class="wb-inp"
          rows="6"
          placeholder="第一章 ……"
          :disabled="source === 'epub'"
          @input="onTextInput"
        />
      </div>

      <div class="wb-field">
        <label>项目名称</label>
        <input v-model="title" class="wb-inp" placeholder="未命名项目（可改，留空则由标题自动生成）" />
      </div>

      <div class="wb-mfoot">
        <span class="wb-note">创建后 AI 画像分析将在任务中心后台运行，不阻塞创作</span>
        <div class="wb-f1" />
        <button class="wb-btn" :disabled="creating" @click="emit('close')">取消</button>
        <button class="wb-btn pri" :disabled="creating || !canSubmit" @click="doCreate">
          {{ creating ? '创建中…' : '创建并进入工作台 →' }}
        </button>
      </div>
    </div>
  </div>
</template>
