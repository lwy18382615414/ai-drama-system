<template>
  <div class="chapters-view">
    <header class="head-bar">
      <div>
        <h1 class="title">章节与事件</h1>
        <p class="subtitle">
          <template v-if="chapters">
            {{ chapters.length }} 章 · 已抽取事件 {{ extractedCount }} 章
            <span v-if="activeExtractCount > 0" class="extracting-badge">
              <span class="pulse-dot" />
              {{ activeExtractCount }} 章抽取中
            </span>
          </template>
          <template v-else>加载中…</template>
        </p>
      </div>
      <div class="head-actions">
        <span class="sse-state" :class="{ off: !connected }" :title="connected ? '实时连接正常' : '实时连接已断开，正在降级轮询'" />
        <NButton size="small" @click="showImport = true">导入章节</NButton>
      </div>
    </header>

    <!-- One-click: run the next batch through to storyboards (no images) -->
    <div v-if="chapters && chapters.length > 0" class="oneclick-bar">
      <template v-if="activeRun">
        <span class="oc-status">
          <span class="pulse-dot" />
          一键生成进行中 · {{ phaseLabel(activeRun.metadata.phase) }}
          <span class="oc-range">第 {{ activeRun.metadata.chapterStartNo }}–{{ activeRun.metadata.chapterEndNo }} 章</span>
        </span> 
      </template>
      <template v-else-if="hasUnplanned">
        <span class="oc-label">一键生成到分镜</span>
        <span class="oc-range">第 {{ nextStartNo }} 章起 →</span>
        <NSelect
          class="oc-select"
          size="small"
          :value="pipelineEndNo"
          :options="endOptions"
          @update:value="(v: number) => (pipelineEndNo = v)"
        />
        <NButton
          size="small"
          type="primary"
          :loading="startPipeline.isPending.value"
          :disabled="pipelineEndNo === null"
          @click="runOneClick"
        >
          生成（第 {{ nextStartNo }}–{{ pipelineEndNo }} 章）
        </NButton>
        <span class="oc-hint">事件提取 → 分集 → 剧本 / 人物场景道具 / 分镜，不生成图片</span>
      </template>
      <template v-else>
        <span class="oc-muted">全部章节已规划入批次</span>
      </template>
    </div>

    <!-- Loading -->
    <div v-if="isPending" class="state-box"><NSpin size="large" /></div>

    <!-- Error -->
    <NResult
      v-else-if="isError"
      status="error"
      title="章节加载失败"
      :description="error?.message ?? '请检查网络或稍后重试'"
      class="state-box"
    >
      <template #footer><NButton type="primary" @click="() => refetch()">重新加载</NButton></template>
    </NResult>

    <!-- Empty -->
    <div v-else-if="!chapters || chapters.length === 0" class="state-box">
      <NEmpty description="还没有章节，先导入小说正文">
        <template #extra><NButton type="primary" @click="showImport = true">导入章节</NButton></template>
      </NEmpty>
    </div>

    <!-- Main split layout: Left Chapters Table + Right Events Panel -->
    <div v-else class="workbench-layout">
      <!-- Left: Chapters Table -->
      <div class="chapters-panel">
        <div class="table-card">
          <div class="row row--head">
            <div class="col-check" @click.stop>
              <NCheckbox
                :checked="allSelected"
                :indeterminate="someSelected"
                @update:checked="toggleSelectAll"
              />
            </div>
            <div class="col-no">章节</div>
            <div class="col-title">标题</div>
            <div class="col-words">字数</div>
            <div class="col-status">状态</div>
            <div class="col-actions">操作</div>
          </div>

          <template v-for="c in chapters" :key="c.id">
            <div
              class="row"
              :class="{
                'row--planned': isPlanned(c),
                'row--active': activeChapterId === c.id
              }"
              @click="selectChapterForDetail(c)"
            >
              <div class="col-check" @click.stop>
                <NCheckbox
                  :checked="isSelected(c.id)"
                  @update:checked="(v: boolean) => toggleSelect(c.id, v)"
                />
              </div>
              <div class="col-no">
                第 {{ c.chapterNo }} 章
                <span v-if="isPlanned(c)" class="planned-tag">已规划</span>
              </div>
              <div class="col-title" :title="c.title || '（未命名）'">{{ c.title || '（未命名）' }}</div>
              <div class="col-words">{{ c.wordCount.toLocaleString() }}</div>
              <div class="col-status">
                <span class="pill" :class="`pill--${statusMeta(c).kind}`">
                  <span v-if="statusMeta(c).kind === 'running'" class="spinner-icon" />
                  {{ statusMeta(c).label }}
                </span>
              </div>
              <div class="col-actions" @click.stop>
                <button
                  v-if="c.status === 'event_extracted'"
                  class="link-btn"
                  :class="{ active: activeChapterId === c.id }"
                  @click="selectChapterForDetail(c)"
                >
                  查看事件
                </button>
                <button
                  class="link-btn"
                  :disabled="!canExtract(c) || startExtraction.isPending.value"
                  :title="isPlanned(c) ? '已规划入批次，不可再抽取' : ''"
                  @click="extractOne(c)"
                >
                  {{ c.status === 'event_extracted' ? '重新抽取' : c.status === 'event_extracting' ? '抽取中…' : '抽取事件' }}
                </button>
              </div>
            </div>
          </template>
        </div>
      </div>

      <!-- Right: Event detail panel -->
      <div class="detail-panel">
        <div v-if="activeChapter" class="detail-card">
          <div class="detail-header">
            <div class="detail-header-info">
              <span class="detail-chapter-no">第 {{ activeChapter.chapterNo }} 章</span>
              <h2 class="detail-chapter-title">{{ activeChapter.title || '（未命名）' }}</h2>
            </div>
            <div class="detail-header-actions">
              <span class="pill" :class="`pill--${statusMeta(activeChapter).kind}`">
                <span v-if="statusMeta(activeChapter).kind === 'running'" class="spinner-icon" />
                {{ statusMeta(activeChapter).label }}
              </span>
              <NButton
                size="tiny"
                type="primary"
                secondary
                :disabled="!canExtract(activeChapter) || startExtraction.isPending.value"
                @click="extractOne(activeChapter)"
              >
                {{ activeChapter.status === 'event_extracted' ? '重新抽取事件' : activeChapter.status === 'event_extracting' ? '抽取中…' : '抽取事件' }}
              </NButton>
            </div>
          </div>

          <div class="detail-body">
            <ChapterEventsPanel :chapter-id="activeChapter.id" />
          </div>
        </div>

        <div v-else class="detail-empty">
          <NEmpty description="点击左侧「查看事件」或章节行，在侧栏查看该章事件列表" />
        </div>
      </div>
    </div>

    <!-- Multi-select action bar -->
    <Transition name="fade-up">
      <div v-if="selected.size > 0" class="action-bar">
        <span class="ab-count">已选 {{ selected.size }} 章</span>
        <div class="ab-actions">
          <NButton
            size="small"
            type="primary"
            :disabled="selectedExtractable.length === 0"
            :loading="batchExtraction.isPending.value"
            @click="extractSelected"
          >
            抽取选中（{{ selectedExtractable.length }}）
          </NButton>
          <NButton
            size="small"
            :disabled="selectedDeletable.length === 0"
            :loading="deleteChapters.isPending.value"
            @click="deleteSelected"
          >
            删除（{{ selectedDeletable.length }}）
          </NButton>
          <NButton size="small" quaternary @click="clearSelection">取消</NButton>
        </div>
      </div>
    </Transition>

    <ChapterImportModal
      v-model:show="showImport"
      :project-id="projectId"
      @imported="onImported"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { NSpin, NResult, NButton, NEmpty, NCheckbox, NSelect, useMessage, useDialog } from 'naive-ui'
import { useChaptersQuery, useDeleteChaptersMutation } from '@/composables/useChapters'
import { useStartEventExtractionMutation, useStartBatchEventExtractionMutation } from '@/composables/useEvents'
import { useStartPipelineRunMutation, useActivePipelineRunQuery } from '@/composables/usePipelineRun'
import type { PipelineRunPhase } from '@/api/pipelineRun'
import { useProjectQuery } from '@/composables/useProjects'
import { useProjectTaskStream } from '@/composables/useProjectTaskStream'
import ChapterEventsPanel from '@/components/ChapterEventsPanel.vue'
import ChapterImportModal from '@/components/ChapterImportModal.vue'
import type { NovelChapter } from '@/api/models'

// 章节与事件（README §2）：章节表 + 抽取状态 + 事件面板。
// 后端是唯一真相：抽取进度经 SSE 使 chapters 查询失效并刷新，本页不自行推断状态。
const route = useRoute()
const projectId = computed(() => String(route.params.projectId ?? ''))
const message = useMessage()
const dialog = useDialog()

const { data: chapters, isPending, isError, error, refetch } = useChaptersQuery(projectId)
const { data: project } = useProjectQuery(projectId)

// Mount the per-project SSE stream here so extraction progress refreshes the list live,
// and drive a small "抽取中" activity counter from it.
const { tasks, connected } = useProjectTaskStream(() => projectId.value)
const activeExtractCount = computed(
  () =>
    tasks.value.filter(
      (t) => t.taskType === 'event_extraction' && (t.status === 'pending' || t.status === 'running'),
    ).length,
)

const startExtraction = useStartEventExtractionMutation()
const batchExtraction = useStartBatchEventExtractionMutation()
const deleteChapters = useDeleteChaptersMutation(projectId)

// ── Derived eligibility ─────────────────────────────────────────────────────
const plannedEndNo = computed(() => project.value?.plannedChapterEndNo ?? 0)
const isPlanned = (c: NovelChapter) => plannedEndNo.value > 0 && c.chapterNo <= plannedEndNo.value
const isExtracting = (c: NovelChapter) => c.status === 'event_extracting'
const canExtract = (c: NovelChapter) => !isPlanned(c) && !isExtracting(c)
const canDelete = (c: NovelChapter) => !isPlanned(c) && !isExtracting(c)

const extractedCount = computed(
  () => chapters.value?.filter((c) => c.status === 'event_extracted').length ?? 0,
)

// ── One-click pipeline run (next batch → storyboards, no images) ───────────────
const startPipeline = useStartPipelineRunMutation()
const { data: activeRun } = useActivePipelineRunQuery(projectId)

// The next batch always starts right after the last planned chapter; the user only
// picks how far it extends. Arbitrary mid-novel selection isn't supported by the planner.
const maxChapterNo = computed(() => (chapters.value?.length ? chapters.value[chapters.value.length - 1].chapterNo : 0))
const nextStartNo = computed(() => plannedEndNo.value + 1)
const hasUnplanned = computed(() => maxChapterNo.value >= nextStartNo.value)
const endOptions = computed(() =>
  (chapters.value ?? [])
    .filter((c) => c.chapterNo >= nextStartNo.value)
    .map((c) => ({ label: `第 ${c.chapterNo} 章`, value: c.chapterNo })),
)
const pipelineEndNo = ref<number | null>(null)
// Keep the picked end within the current unplanned range; default to "all remaining".
watch(
  [nextStartNo, maxChapterNo],
  () => {
    if (pipelineEndNo.value === null || pipelineEndNo.value < nextStartNo.value || pipelineEndNo.value > maxChapterNo.value) {
      pipelineEndNo.value = maxChapterNo.value || null
    }
  },
  { immediate: true },
)

const phaseLabel = (phase: PipelineRunPhase): string =>
  ({
    extracting: '事件提取中',
    planning: '规划分集中',
    producing: '生成剧本/资产/分镜中',
    done: '已完成',
    failed: '部分失败',
  })[phase]

async function runOneClick() {
  if (!hasUnplanned.value || pipelineEndNo.value === null) return
  try {
    const res = await startPipeline.mutateAsync({
      projectId: projectId.value,
      chapterEndNo: pipelineEndNo.value,
      generateImages: false,
    })
    message.success(
      res.reused ? '已有一键生成任务在进行中' : `已提交一键生成（第 ${nextStartNo.value}–${pipelineEndNo.value} 章 → 分镜）`,
    )
  } catch (err) {
    message.error((err as Error)?.message || '一键生成提交失败')
  }
}

// ── Selection ────────────────────────────────────────────────────────────────
const selected = ref<Set<string>>(new Set())
const isSelected = (id: string) => selected.value.has(id)
function toggleSelect(id: string, value: boolean) {
  const next = new Set(selected.value)
  value ? next.add(id) : next.delete(id)
  selected.value = next
}
function clearSelection() {
  selected.value = new Set()
}
const allSelected = computed(
  () => !!chapters.value && chapters.value.length > 0 && selected.value.size === chapters.value.length,
)
const someSelected = computed(() => selected.value.size > 0 && !allSelected.value)
function toggleSelectAll(value: boolean) {
  selected.value = value ? new Set((chapters.value ?? []).map((c) => c.id)) : new Set()
}
const selectedChapters = computed(() => (chapters.value ?? []).filter((c) => selected.value.has(c.id)))
const selectedExtractable = computed(() => selectedChapters.value.filter(canExtract))
const selectedDeletable = computed(() => selectedChapters.value.filter(canDelete))

// ── Active Detail Chapter ───────────────────────────────────────────────────
const activeChapterId = ref<string | null>(null)
const activeChapter = computed(() => {
  if (!chapters.value || chapters.value.length === 0) return null
  if (!activeChapterId.value) return null
  return chapters.value.find((c) => c.id === activeChapterId.value) ?? null
})

// Auto-select first chapter or active extracting chapter if none selected
watch(
  () => chapters.value,
  (list) => {
    if (!list || list.length === 0) return
    if (!activeChapterId.value || !list.some((c) => c.id === activeChapterId.value)) {
      const extracting = list.find((c) => c.status === 'event_extracting')
      const extracted = list.find((c) => c.status === 'event_extracted')
      activeChapterId.value = extracting?.id ?? extracted?.id ?? list[0].id
    }
  },
  { immediate: true },
)

function selectChapterForDetail(c: NovelChapter) {
  activeChapterId.value = c.id
}

// ── Import ───────────────────────────────────────────────────────────────────
const showImport = ref(false)
function onImported() {
  refetch()
}

// ── Status pill ──────────────────────────────────────────────────────────────
function statusMeta(c: NovelChapter): { label: string; kind: string } {
  if (isExtracting(c)) return { label: '抽取中', kind: 'running' }
  if (c.status === 'event_extracted') return { label: '已抽取', kind: 'done' }
  return { label: '未抽取', kind: 'idle' }
}

// ── Actions ──────────────────────────────────────────────────────────────────
async function doExtractOne(c: NovelChapter) {
  try {
    await startExtraction.mutateAsync({ projectId: projectId.value, chapterId: c.id })
    message.success(`已提交「第 ${c.chapterNo} 章」事件抽取`)
  } catch (err) {
    message.error((err as Error)?.message || '提交抽取失败')
  }
}

function extractOne(c: NovelChapter) {
  if (c.status === 'event_extracted') {
    dialog.warning({
      title: '重新抽取事件',
      content: `「第 ${c.chapterNo} 章」已经抽取过事件，重新抽取将覆盖现有事件数据。是否继续？`,
      positiveText: '重新抽取',
      negativeText: '取消',
      onPositiveClick: () => {
        doExtractOne(c)
      },
    })
  } else {
    doExtractOne(c)
  }
}

async function extractSelected() {
  const ids = selectedExtractable.value.map((c) => c.id)
  if (ids.length === 0) return
  try {
    const res = await batchExtraction.mutateAsync({ projectId: projectId.value, chapterIds: ids })
    const queued = res.tasks.length
    const skipped = res.skipped.length
    message.success(`已提交 ${queued} 章抽取${skipped > 0 ? `，跳过 ${skipped} 章` : ''}`)
    clearSelection()
  } catch (err) {
    message.error((err as Error)?.message || '批量抽取失败')
  }
}

function deleteSelected() {
  const targets = selectedDeletable.value
  if (targets.length === 0) return
  dialog.warning({
    title: '删除章节',
    content: `将删除选中的 ${targets.length} 章及其事件，且不可撤销。已规划入批次的章节不可删除。是否继续？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        const res = await deleteChapters.mutateAsync(targets.map((c) => c.id))
        message.success(`已删除 ${res.deletedCount} 章`)
        clearSelection()
      } catch (err) {
        message.error((err as Error)?.message || '删除失败')
      }
    },
  })
}
</script>

<style scoped>
.chapters-view {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
.head-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  flex-shrink: 0;
}
.title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #1f2225;
}
.subtitle {
  font-size: 13px;
  color: #8a9099;
  margin: 4px 0 0;
  display: flex;
  align-items: center;
  gap: 8px;
}
.extracting-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: #eaf3fd;
  color: #2080f0;
  font-size: 12px;
  font-weight: 500;
  padding: 2px 10px;
  border-radius: 12px;
  border: 1px solid #d0e4ff;
}
.pulse-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #2080f0;
  box-shadow: 0 0 0 0 rgba(32, 128, 240, 0.7);
  animation: pulse-blue 1.6s infinite ease-in-out;
}
@keyframes pulse-blue {
  0% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(32, 128, 240, 0.7);
  }
  70% {
    transform: scale(1);
    box-shadow: 0 0 0 6px rgba(32, 128, 240, 0);
  }
  100% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(32, 128, 240, 0);
  }
}
.head-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.oneclick-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
  padding: 10px 14px;
  background: #f6f9fe;
  border: 1px solid #dbe8fb;
  border-radius: 12px;
  flex-shrink: 0;
}
.oc-label {
  font-size: 13px;
  font-weight: 600;
  color: #1f2225;
}
.oc-range {
  font-size: 12px;
  color: #5b6169;
}
.oc-select {
  width: 120px;
}
.oc-hint {
  font-size: 12px;
  color: #8a9099;
}
.oc-muted {
  font-size: 13px;
  color: #8a9099;
}
.oc-status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 500;
  color: #2080f0;
}
.sse-state {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #18a058;
}
.sse-state.off {
  background: #e0a020;
}
.state-box {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 340px;
  background: #fff;
  border: 1px solid #e4e7eb;
  border-radius: 14px;
}

/* ── Split Layout ────────────────────────────────────────────────────────── */
.workbench-layout {
  display: flex;
  gap: 16px;
  align-items: stretch;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.chapters-panel {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  border-radius: 14px;
}

.detail-panel {
  width: 420px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.detail-card {
  background: #fff;
  border: 1px solid #e4e7eb;
  border-radius: 14px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  height: 100%;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.03);
}

.detail-header {
  padding: 14px 16px;
  border-bottom: 1px solid #edf0f2;
  background: #fafbfc;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
}

.detail-header-info {
  min-width: 0;
}

.detail-chapter-no {
  font-size: 11px;
  color: #8a9099;
  font-weight: 500;
  display: block;
}

.detail-chapter-title {
  margin: 2px 0 0;
  font-size: 15px;
  font-weight: 600;
  color: #1f2225;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.detail-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.detail-body {
  padding: 16px;
  overflow-y: auto;
  flex: 1;
}

.detail-empty {
  background: #fff;
  border: 1px dashed #dcdfe6;
  border-radius: 14px;
  padding: 48px 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.table-card {
  background: #fff;
  border: 1px solid #e4e7eb;
  border-radius: 14px;
  overflow: hidden;
}
.row {
  display: grid;
  grid-template-columns: 36px 95px 1fr 75px 85px 140px;
  align-items: center;
  padding: 10px 14px;
  border-bottom: 1px solid #f2f4f6;
  /* Transparent left border on every row so .row--active's colored border
     does not shift content sideways and break column alignment. */
  border-left: 3px solid transparent;
  font-size: 13px;
  color: #2b2f33;
  cursor: pointer;
  transition: background-color 0.15s ease;
}
.row:hover {
  background: #f7f9fa;
}
.row--head {
  background: #fafbfc;
  color: #8a9099;
  font-size: 12px;
  position: sticky;
  top: 0;
  cursor: default;
}
.row--head:hover {
  background: #fafbfc;
}
.row--planned {
  background: #fcfcfa;
}
.row--active {
  background: #f0f7ff !important;
  border-left: 3px solid #2080f0;
}
.col-check {
  display: flex;
  align-items: center;
  justify-content: flex-start;
}
.col-no {
  color: #5b6169;
  display: flex;
  align-items: center;
  gap: 6px;
}
.planned-tag {
  font-size: 10px;
  color: #a0740c;
  background: #fdf3e6;
  border-radius: 4px;
  padding: 0 6px;
}
.col-title {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-right: 12px;
}
.col-words {
  color: #5b6169;
  font-variant-numeric: tabular-nums;
}
.pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  border-radius: 10px;
  padding: 2px 10px;
}
.pill--idle {
  color: #8a9099;
  background: #f0f2f5;
}
.pill--running {
  color: #2080f0;
  background: #eaf3fd;
  border: 1px solid #d0e4ff;
}
.spinner-icon {
  width: 12px;
  height: 12px;
  border: 2px solid rgba(32, 128, 240, 0.25);
  border-top-color: #2080f0;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  display: inline-block;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.pill--done {
  color: #18a058;
  background: #e7f5ee;
}
.col-actions {
  display: flex;
  gap: 10px;
}
.link-btn {
  border: none;
  background: none;
  padding: 0;
  font-size: 12px;
  color: #18a058;
  cursor: pointer;
  font-family: inherit;
}
.link-btn.active {
  color: #2080f0;
  font-weight: 600;
}
.link-btn:hover {
  text-decoration: underline;
}
.link-btn:disabled {
  color: #c0c4c9;
  cursor: not-allowed;
  text-decoration: none;
}
.action-bar {
  position: absolute;
  bottom: 20px;
  left: 0;
  right: 0;
  margin: 0 auto;
  width: fit-content;
  max-width: 560px;
  z-index: 20;
  background: #1f2225;
  color: #fff;
  border-radius: 12px;
  padding: 10px 16px;
  display: flex;
  align-items: center;
  gap: 20px;
  box-shadow: 0 10px 30px rgba(31, 34, 37, 0.28);
}
.ab-count {
  font-size: 13px;
}
.ab-actions {
  display: flex;
  gap: 8px;
}
/* Quaternary "取消" button sits on the dark bar — force a readable light color. */
.action-bar :deep(.n-button.n-button--quaternary-type) {
  color: rgba(255, 255, 255, 0.7);
}
.action-bar :deep(.n-button.n-button--quaternary-type:hover) {
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
}
.fade-up-enter-active,
.fade-up-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.fade-up-enter-from,
.fade-up-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
