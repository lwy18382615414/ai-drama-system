<script setup lang="ts">
import { inject, ref } from 'vue'
import { importChapters, type NovelSource } from '@/api/projects'
import { getApiErrorMessage } from '@/api/client'
import { WorkbenchKey } from '@/composables/workbenchKey'
import NovelSourceInput, { type NovelPreviewedPayload } from '@/components/NovelSourceInput.vue'
import ChapterPreviewTable, { type PreviewRow } from '@/components/ChapterPreviewTable.vue'

const emit = defineEmits<{ close: [] }>()
const wb = inject(WorkbenchKey)!
const message = useMessage()

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
    .map((row) => ({ title: row.editableTitle.trim() || null, content: row.content }))

  if (!chapters.length) {
    message.warning('请至少勾选一章')
    return
  }

  importing.value = true
  try {
    await importChapters(wb.projectId, { source: source.value, chapters })
    message.success(`已导入 ${chapters.length} 章`)
    await wb.refreshAll()
    emit('close')
  } catch (error) {
    message.error(getApiErrorMessage(error))
  } finally {
    importing.value = false
  }
}
</script>

<template>
  <div class="wb-modal" @click.self="emit('close')">
    <div class="wb-msheet lg">
      <p class="wb-mtitle">导入章节</p>
      <p class="wb-mhint">粘贴文本或上传 .txt / .epub 文件，追加章节到当前项目。</p>

      <NovelSourceInput v-if="step === 'source'" @previewed="onPreviewed" />

      <template v-else>
        <ChapterPreviewTable :rows="previewRows" />
        <div class="wb-mfoot">
          <span class="wb-note">章节导入后即出现在左侧章节树中，可随时提取事件</span>
          <div class="wb-f1" />
          <button class="wb-btn" :disabled="importing" @click="step = 'source'">上一步</button>
          <button class="wb-btn pri" :disabled="importing" @click="confirmImport">{{ importing ? '导入中…' : '确认导入' }}</button>
        </div>
      </template>

      <div v-if="step === 'source'" class="wb-mfoot">
        <span class="wb-note" />
        <div class="wb-f1" />
        <button class="wb-btn" @click="emit('close')">取消</button>
      </div>
    </div>
  </div>
</template>
