<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { NModal, NButton, NInput, NSpin, useMessage } from 'naive-ui'
import { usePreviewChaptersMutation } from '@/composables/useNovel'
import { useImportChaptersMutation } from '@/composables/useChapters'
import type { SplitChapter } from '@/api/novel'

// 向已有项目追加章节：粘贴正文 → 预览切分 → 导入（POST /projects/:id/chapters/import）。
const props = defineProps<{ show: boolean; projectId: string }>()
const emit = defineEmits<{
  (e: 'update:show', value: boolean): void
  (e: 'imported', count: number): void
}>()

const message = useMessage()
const rawText = ref('')
const preview = ref<SplitChapter[]>([])

const previewMutation = usePreviewChaptersMutation()
const importMutation = useImportChaptersMutation(() => props.projectId)

const totalWords = computed(() => preview.value.reduce((acc, c) => acc + c.wordCount, 0))

// Re-preview shortly after the text settles so the count stays in sync as the user pastes.
let debounce: ReturnType<typeof setTimeout> | undefined
watch(rawText, (text) => {
  clearTimeout(debounce)
  if (!text.trim()) {
    preview.value = []
    return
  }
  debounce = setTimeout(async () => {
    try {
      preview.value = await previewMutation.mutateAsync(text)
    } catch (err) {
      preview.value = []
      message.error((err as Error)?.message || '章节预览失败')
    }
  }, 400)
})

function close() {
  rawText.value = ''
  preview.value = []
  emit('update:show', false)
}

async function confirmImport() {
  if (preview.value.length === 0) return
  try {
    const chapters = preview.value.map((c) => ({ title: c.title, content: c.content }))
    const rows = await importMutation.mutateAsync({ source: 'paste', chapters })
    message.success(`已导入 ${rows.length} 章`)
    emit('imported', rows.length)
    close()
  } catch (err) {
    message.error((err as Error)?.message || '导入失败')
  }
}
</script>

<template>
  <NModal
    :show="show"
    :mask-closable="false"
    preset="card"
    :style="{ width: '560px', borderRadius: '14px' }"
    @update:show="(v: boolean) => !v && close()"
  >
    <template #header><div class="modal-title">导入章节</div></template>

    <div class="body">
      <label class="form-label">粘贴要追加的小说正文（自动识别「第 N 章」切分）</label>
      <NInput
        v-model:value="rawText"
        type="textarea"
        placeholder="粘贴正文文本…"
        :rows="6"
      />

      <div class="preview-line">
        <template v-if="previewMutation.isPending.value">
          <NSpin size="small" /> <span>正在切分…</span>
        </template>
        <template v-else-if="preview.length > 0">
          ✓ 识别到 <b>{{ preview.length }}</b> 章，共 {{ totalWords.toLocaleString() }} 字
        </template>
        <template v-else-if="rawText.trim()">未识别到章节，请检查正文格式。</template>
        <template v-else>&nbsp;</template>
      </div>
    </div>

    <template #footer>
      <div class="footer-btns">
        <NButton @click="close">取消</NButton>
        <NButton
          type="primary"
          :disabled="preview.length === 0"
          :loading="importMutation.isPending.value"
          @click="confirmImport"
        >
          导入 {{ preview.length || '' }} 章
        </NButton>
      </div>
    </template>
  </NModal>
</template>

<style scoped>
.modal-title {
  font-size: 16px;
  font-weight: 600;
  color: #1f2225;
}
.body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.form-label {
  font-size: 12px;
  color: #5b6169;
}
.preview-line {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 22px;
  font-size: 13px;
  color: #155e38;
}
.footer-btns {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
