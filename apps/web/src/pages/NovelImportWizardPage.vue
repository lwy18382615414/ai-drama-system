<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { importChapters, type NovelSource } from '@/api/projects'
import { getApiErrorMessage } from '@/api/client'
import { useProject } from '@/composables/useProject'
import NovelSourceInput, { type NovelPreviewedPayload } from '@/components/NovelSourceInput.vue'
import ChapterPreviewTable, { type PreviewRow } from '@/components/ChapterPreviewTable.vue'
import PanelCard from '@/components/PanelCard.vue'

const message = useMessage()
const router = useRouter()
const { projectId } = useProject()

const step = ref<'source' | 'preview'>('source')
const source = ref<NovelSource>('paste')
const previewRows = ref<PreviewRow[]>([])
const importing = ref(false)

function onPreviewed(payload: NovelPreviewedPayload) {
  source.value = payload.source
  previewRows.value = payload.chapters.map((chapter) => ({
    ...chapter,
    include: true,
    editableTitle: chapter.title ?? '',
  }))
  step.value = 'preview'
}

async function confirmImport() {
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

  importing.value = true
  try {
    await importChapters(projectId.value, { source: source.value, chapters })
    message.success(`已导入 ${chapters.length} 章`)
    void router.push({ name: 'novel', params: { id: projectId.value } })
  } catch (error) {
    message.error(getApiErrorMessage(error))
  } finally {
    importing.value = false
  }
}

function backToNovel() {
  void router.push({ name: 'novel', params: { id: projectId.value } })
}
</script>

<template>
  <div>
    <div class="sf-page-head">
      <div>
        <h1 class="sf-page-title">导入章节</h1>
        <p class="sf-page-desc">粘贴文本或上传 .txt / .epub 文件，追加章节到当前项目。</p>
      </div>
      <n-button @click="backToNovel">返回小说页</n-button>
    </div>

    <PanelCard v-if="step === 'source'" title="第 1 步 · 导入小说" framed>
      <NovelSourceInput @previewed="onPreviewed" />
    </PanelCard>

    <PanelCard v-else title="第 2 步 · 确认章节" framed>
      <ChapterPreviewTable :rows="previewRows" />
      <div class="sf-row sf-mt-16" style="justify-content: flex-end; gap: 8px">
        <n-button :disabled="importing" @click="step = 'source'">上一步</n-button>
        <n-button type="primary" :loading="importing" @click="confirmImport">确认导入</n-button>
      </div>
    </PanelCard>
  </div>
</template>
