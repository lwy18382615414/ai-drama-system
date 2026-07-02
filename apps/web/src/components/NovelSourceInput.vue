<script setup lang="ts">
import { ref } from 'vue'
import {
  previewNovelFile,
  previewNovelText,
  type NovelMeta,
  type NovelSource,
  type SplitChapterPreview,
} from '@/api/projects'
import { getApiErrorMessage } from '@/api/client'

export interface NovelPreviewedPayload {
  chapters: SplitChapterPreview[]
  meta: NovelMeta | null
  source: NovelSource
}

const emit = defineEmits<{ previewed: [payload: NovelPreviewedPayload] }>()

const message = useMessage()
const text = ref('')
const source = ref<NovelSource>('paste')
const fileName = ref('')
const epubFile = ref<File | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const previewing = ref(false)

/** Try strict UTF-8 first; malformed bytes mean a legacy Chinese encoding, so fall back to GBK. */
function decodeTxt(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    return new TextDecoder('gbk').decode(buffer)
  }
}

async function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  try {
    if (file.name.toLowerCase().endsWith('.epub')) {
      // EPUB is a zip archive parsed on the server at preview time.
      epubFile.value = file
      text.value = ''
      source.value = 'epub'
    } else {
      const buffer = await file.arrayBuffer()
      text.value = decodeTxt(buffer)
      epubFile.value = null
      source.value = 'txt'
    }
    fileName.value = file.name
  } catch (error) {
    message.error(getApiErrorMessage(error))
  } finally {
    input.value = ''
  }
}

function onTextInput() {
  // Typing switches back to paste mode and discards a previously selected file.
  if (source.value !== 'paste' && text.value.trim()) {
    source.value = 'paste'
    epubFile.value = null
    fileName.value = ''
  }
}

async function preview() {
  if (source.value === 'epub' && epubFile.value) {
    previewing.value = true
    try {
      const result = await previewNovelFile(epubFile.value)
      if (!result.chapters.length) {
        message.warning('未能从 EPUB 中解析出章节')
        return
      }
      emit('previewed', { ...result, source: 'epub' })
    } catch (error) {
      message.error(getApiErrorMessage(error))
    } finally {
      previewing.value = false
    }
    return
  }

  if (!text.value.trim()) {
    message.warning('请先粘贴小说文本或选择 .txt / .epub 文件')
    return
  }

  previewing.value = true
  try {
    const result = await previewNovelText(text.value)
    if (!result.chapters.length) {
      message.warning('未能从文本中切分出章节')
      return
    }
    emit('previewed', { ...result, source: source.value })
  } catch (error) {
    message.error(getApiErrorMessage(error))
  } finally {
    previewing.value = false
  }
}
</script>

<template>
  <div>
    <div class="sf-field">
      <label class="sf-label">粘贴整本小说文本，或选择 .txt / .epub 文件（txt 自动识别 UTF-8 / GBK 编码）</label>
      <n-input
        v-model:value="text"
        type="textarea"
        placeholder="在此粘贴小说全文，支持“第X章 / Chapter N”等标题自动分章…"
        :autosize="{ minRows: 12, maxRows: 18 }"
        :disabled="source === 'epub'"
        @input="onTextInput"
      />
      <p v-if="source === 'epub'" class="sf-muted sf-mt-8">
        已选择 EPUB 文件，将在服务端按目录结构分章。重新粘贴文本前请先取消文件。
      </p>
    </div>
    <div class="sf-row sf-row--between sf-mt-16">
      <div class="sf-row" style="gap: 8px; align-items: center">
        <input ref="fileInputRef" type="file" accept=".txt,.epub" style="display: none" @change="onFileChange" />
        <n-button @click="fileInputRef?.click()">📄 选择 .txt / .epub 文件</n-button>
        <span v-if="fileName" class="sf-muted">{{ fileName }}</span>
        <n-button
          v-if="source === 'epub'"
          quaternary
          size="small"
          @click="() => { epubFile = null; fileName = ''; source = 'paste' }"
        >
          取消文件
        </n-button>
      </div>
      <div class="sf-row" style="gap: 8px">
        <slot name="actions" />
        <n-button type="primary" :loading="previewing" @click="preview">分章预览</n-button>
      </div>
    </div>
  </div>
</template>
