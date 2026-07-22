<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  NModal,
  NButton,
  NInput,
  NSelect,
  NCheckbox,
  NSpin,
  useMessage,
} from 'naive-ui'
import {
  previewChapters,
  previewChaptersFile,
  createProjectFromNovel,
  type SplitChapter,
} from '@/api/novel'

defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void
  (e: 'created', projectId: string): void
}>()

const message = useMessage()

const currentStep = ref<1 | 2>(1)
const fileInputRef = ref<HTMLInputElement | null>(null)

// Step 1 states
const rawText = ref('')
const selectedFile = ref<File | null>(null)
const fileWordCount = ref<number | null>(null)
const projectName = ref('')
const isParsingFile = ref(false)
// Where the novel came from — sent to POST /projects/from-novel as `source`.
const sourceType = ref<'paste' | 'txt' | 'epub'>('paste')

// Step 2 states
const splitRule = ref<'title' | 'blank' | 'fixed_words'>('title')
const isSplitting = ref(false)
// Full splitter output (title + content + wordCount); content is needed for from-novel.
const previewChaptersList = ref<SplitChapter[]>([])
const autoStartExtract = ref(true)

const isCreating = ref(false)

const dropBorderColor = computed(() => (selectedFile.value ? '#18a058' : '#d5d9dd'))
const dropBgColor = computed(() => (selectedFile.value ? '#f2faf5' : '#fafbfc'))

const isStep1Valid = computed(() => {
  const hasContent = selectedFile.value !== null || rawText.value.trim().length > 0
  return hasContent && projectName.value.trim().length > 0
})

const splitRuleOptions = [
  { label: '自动识别「第 N 章」标题（推荐）', value: 'title' },
  { label: '按空行分段', value: 'blank' },
  { label: '固定字数切分（约 3000 字/章）', value: 'fixed_words' },
]

const totalWords = computed(() => {
  return previewChaptersList.value.reduce((acc, cur) => acc + cur.wordCount, 0)
})

const avgWords = computed(() => {
  if (previewChaptersList.value.length === 0) return 0
  return Math.round(totalWords.value / previewChaptersList.value.length)
})

function handleClose() {
  resetForm()
  emit('update:show', false)
}

function resetForm() {
  currentStep.value = 1
  rawText.value = ''
  selectedFile.value = null
  sourceType.value = 'paste'
  fileWordCount.value = null
  projectName.value = ''
  previewChaptersList.value = []
  autoStartExtract.value = true
  isParsingFile.value = false
  isSplitting.value = false
  isCreating.value = false
}

function triggerFileSelect() {
  fileInputRef.value?.click()
}

async function handleFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  if (file.name.endsWith('.epub')) {
    isParsingFile.value = true
    try {
      const res = await previewChaptersFile(file)
      selectedFile.value = file
      sourceType.value = 'epub'
      const combined = res.chapters.map((c) => c.content).join('\n')
      fileWordCount.value = combined.length
      if (res.meta?.title && !projectName.value) {
        projectName.value = res.meta.title
      } else if (!projectName.value) {
        projectName.value = file.name.replace(/\.[^/.]+$/, '')
      }
      rawText.value = combined
    } catch (err: any) {
      message.error(err?.message || '解析 EPUB 文件失败')
      selectedFile.value = null
    } finally {
      isParsingFile.value = false
    }
  } else {
    // txt / raw text
    selectedFile.value = file
    sourceType.value = 'txt'
    const text = await file.text()
    rawText.value = text
    fileWordCount.value = text.length
    if (!projectName.value) {
      projectName.value = file.name.replace(/\.[^/.]+$/, '')
    }
  }
}

function handleDrop(event: DragEvent) {
  event.preventDefault()
  const file = event.dataTransfer?.files?.[0]
  if (file) {
    const dt = new DataTransfer()
    dt.items.add(file)
    if (fileInputRef.value) {
      fileInputRef.value.files = dt.files
      handleFileChange({ target: fileInputRef.value } as any)
    }
  }
}

async function goToStep2() {
  if (!isStep1Valid.value) return
  currentStep.value = 2
  await fetchPreviewChapters()
}

async function fetchPreviewChapters() {
  if (!rawText.value.trim()) return
  isSplitting.value = true
  try {
    // The backend splits automatically from the text alone; `splitRule` is a UI hint only.
    previewChaptersList.value = await previewChapters(rawText.value)
  } catch (err: any) {
    message.error(err?.message || '获取章节预览失败')
  } finally {
    isSplitting.value = false
  }
}

async function handleRuleChange(newVal: 'title' | 'blank' | 'fixed_words') {
  splitRule.value = newVal
  await fetchPreviewChapters()
}

async function handleCreateProject() {
  if (isCreating.value) return
  isCreating.value = true
  try {
    const chapters = previewChaptersList.value.map((c) => ({ title: c.title, content: c.content }))
    const res = await createProjectFromNovel({
      title: projectName.value,
      source: sourceType.value,
      chapters,
    })
    emit('created', res.project.id)
    resetForm()
  } catch (err: any) {
    message.error(err?.message || '创建项目失败')
  } finally {
    isCreating.value = false
  }
}
</script>

<template>
  <NModal
    :show="show"
    :mask-closable="false"
    preset="card"
    class="create-project-modal"
    :style="{ width: '560px', borderRadius: '14px' }"
    @update:show="handleClose"
  >
    <template #header>
      <div class="modal-title">新建项目</div>
    </template>

    <div class="wizard-container">
      <!-- Steps header -->
      <div class="steps-bar">
        <div class="step-item" :class="{ active: currentStep === 1, done: currentStep > 1 }">
          <span class="step-num">1</span>
          <span class="step-label">导入小说</span>
        </div>
        <div class="step-line" />
        <div class="step-item" :class="{ active: currentStep === 2 }">
          <span class="step-num">2</span>
          <span class="step-label">章节切分预览</span>
        </div>
      </div>

      <!-- Step 1 content -->
      <div v-if="currentStep === 1" class="step-content">
        <input
          ref="fileInputRef"
          type="file"
          accept=".txt,.epub"
          style="display: none"
          @change="handleFileChange"
        />

        <div
          class="drop-zone"
          :style="{ borderColor: dropBorderColor, backgroundColor: dropBgColor }"
          @click="triggerFileSelect"
          @dragover.prevent
          @drop="handleDrop"
        >
          <template v-if="isParsingFile">
            <NSpin size="medium" />
            <span class="drop-hint">正在解析 EPUB 文件...</span>
          </template>
          <template v-else-if="selectedFile">
            <span class="file-icon">✓</span>
            <span class="file-name">{{ selectedFile.name }}</span>
            <span class="file-meta">
              {{ fileWordCount ? `${fileWordCount.toLocaleString()} 字` : '' }}
            </span>
          </template>
          <template v-else>
            <span class="upload-icon">↑</span>
            <span class="drop-hint">拖入 .txt / .epub 文件，或点击选择</span>
            <span class="drop-sub">也可以在下方直接粘贴正文</span>
          </template>
        </div>

        <div class="form-group">
          <label class="form-label">或在此粘贴小说正文…</label>
          <NInput
            v-model:value="rawText"
            type="textarea"
            placeholder="粘贴小说正文文本…"
            :rows="3"
            class="text-area-input"
          />
        </div>

        <div class="form-group">
          <label class="form-label">项目名称（自动从文件名识别，可改）</label>
          <NInput v-model:value="projectName" placeholder="请输入项目名称" />
        </div>
      </div>

      <!-- Step 2 content -->
      <div v-else-if="currentStep === 2" class="step-content">
        <div class="rule-selector">
          <span class="rule-label">切分规则</span>
          <NSelect
            :value="splitRule"
            :options="splitRuleOptions"
            class="rule-select"
            @update:value="handleRuleChange"
          />
        </div>

        <div v-if="isSplitting" class="splitting-state">
          <NSpin size="small" />
          <span>正自动识别分析章节...</span>
        </div>

        <div v-else class="result-banner">
          ✓ 识别到 <b>{{ previewChaptersList.length }}</b> 个章节，共
          {{ totalWords.toLocaleString() }} 字，平均每章约
          {{ avgWords.toLocaleString() }} 字
        </div>

        <div class="preview-table-container">
          <div class="preview-table-header">
            <div class="col-no">章节</div>
            <div class="col-title">标题</div>
            <div class="col-words">字数</div>
          </div>
          <div class="preview-table-body">
            <div
              v-for="(c, idx) in previewChaptersList.slice(0, 5)"
              :key="idx"
              class="preview-row"
            >
              <div class="col-no">第 {{ idx + 1 }} 章</div>
              <div class="col-title">{{ c.title }}</div>
              <div class="col-words">{{ c.wordCount.toLocaleString() }} 字</div>
            </div>
            <div v-if="previewChaptersList.length > 5" class="more-row">
              其余 {{ previewChaptersList.length - 5 }} 章...
            </div>
          </div>
        </div>

        <div class="auto-extract-option">
          <NCheckbox v-model:checked="autoStartExtract">
            创建后自动开始事件抽取（推荐）
          </NCheckbox>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="modal-footer-btns">
        <template v-if="currentStep === 1">
          <NButton @click="handleClose">取消</NButton>
          <NButton
            type="primary"
            :disabled="!isStep1Valid"
            @click="goToStep2"
          >
            下一步
          </NButton>
        </template>
        <template v-else>
          <NButton @click="currentStep = 1">上一步</NButton>
          <NButton
            type="primary"
            :loading="isCreating"
            @click="handleCreateProject"
          >
            创建项目
          </NButton>
        </template>
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
.wizard-container {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.steps-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 4px;
}
.step-item {
  display: flex;
  align-items: center;
  gap: 8px;
}
.step-num {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #f0f2f5;
  color: #8a9099;
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}
.step-item.active .step-num {
  background: #18a058;
  color: #fff;
}
.step-item.done .step-num {
  background: #e7f5ee;
  color: #18a058;
}
.step-label {
  font-size: 13px;
  color: #8a9099;
}
.step-item.active .step-label {
  color: #1f2225;
  font-weight: 600;
}
.step-line {
  flex: 1;
  height: 1px;
  background: #e4e7eb;
}
.step-content {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.drop-zone {
  border: 1.5px dashed #d5d9dd;
  border-radius: 10px;
  padding: 24px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  transition: all 0.18s ease;
}
.drop-zone:hover {
  border-color: #18a058 !important;
}
.upload-icon {
  font-size: 22px;
  color: #a0a6ad;
  line-height: 1;
}
.drop-hint {
  font-size: 13px;
  color: #5b6169;
  font-weight: 500;
}
.drop-sub {
  font-size: 12px;
  color: #a0a6ad;
}
.file-icon {
  font-size: 18px;
  color: #18a058;
  font-weight: bold;
}
.file-name {
  font-size: 13px;
  color: #18a058;
  font-weight: 600;
}
.file-meta {
  font-size: 12px;
  color: #8a9099;
}
.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.form-label {
  font-size: 12px;
  color: #5b6169;
}
.rule-selector {
  display: flex;
  align-items: center;
  gap: 12px;
}
.rule-label {
  font-size: 13px;
  color: #5b6169;
  white-space: nowrap;
}
.rule-select {
  flex: 1;
}
.splitting-state {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  font-size: 13px;
  color: #2080f0;
  background: #eaf3fd;
  border-radius: 8px;
}
.result-banner {
  background: #e7f5ee;
  border: 1px solid #c3e6d2;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 13px;
  color: #155e38;
}
.preview-table-container {
  border: 1px solid #edf0f2;
  border-radius: 8px;
  overflow: hidden;
}
.preview-table-header {
  display: grid;
  grid-template-columns: 70px 1fr 90px;
  padding: 8px 14px;
  background: #fafbfc;
  border-bottom: 1px solid #edf0f2;
  font-size: 12px;
  color: #8a9099;
}
.preview-table-body {
  max-height: 180px;
  overflow-y: auto;
}
.preview-row {
  display: grid;
  grid-template-columns: 70px 1fr 90px;
  padding: 8px 14px;
  border-bottom: 1px solid #f2f4f6;
  font-size: 12px;
  color: #2b2f33;
}
.col-no {
  color: #8a9099;
}
.col-title {
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.col-words {
  text-align: right;
  color: #5b6169;
}
.more-row {
  padding: 8px 14px;
  font-size: 12px;
  color: #a0a6ad;
  text-align: center;
  background: #fafbfc;
}
.auto-extract-option {
  margin-top: 4px;
}
.modal-footer-btns {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>