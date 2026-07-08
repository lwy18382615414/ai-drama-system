<template>
  <div :class="['pane', inspOn ? '' : 'noinsp']">
    <!-- Chapters tree -->
    <aside class="tree">
      <div class="treehd">
        <span class="thead" style="padding: 0">章节</span>
        <div style="display: flex; gap: 6px">
          <button
            v-if="chapters.length && !selectMode"
            class="mini"
            title="多选章节进行提取或删除"
            @click="enterSelectMode"
          >
            多选
          </button>
          <button class="mini" title="导入小说" @click="openImport">导入</button>
        </div>
      </div>

      <template v-if="selectMode">
        <div class="selbar">
          <button class="mini" @click="toggleSelectAll">{{ allSelected ? '取消全选' : '全选' }}</button>
          <button class="mini" @click="exitSelectMode">退出多选</button>
        </div>
        <button class="mini blk" :disabled="busy || !selectedIds.size" @click="extractSelected">
          提取选中({{ selectedIds.size }})
        </button>
        <button class="mini blk danger" :disabled="busy || !selectedIds.size" @click="deleteSelected">
          删除选中({{ selectedIds.size }})
        </button>
      </template>
      <button
        v-else-if="chapters.length"
        class="mini blk"
        :disabled="busy"
        @click="extractAll"
      >
        ⚡ 批量提取所有事件
      </button>

      <button
        v-for="(c, i) in chapters"
        :key="c.id"
        :class="['trow', !selectMode && i === activeIdx ? 'on' : '', selectMode && !selectable(c) ? 'dis' : '']"
        :title="selectMode ? rowHint(c) : ''"
        @click="selectMode ? toggleSelect(c) : selectChapter(i)"
      >
        <input
          v-if="selectMode"
          type="checkbox"
          class="cb"
          :checked="selectedIds.has(c.id)"
          :disabled="!selectable(c)"
          @click.stop="toggleSelect(c)"
        />
        {{ c.title || `第${c.chapterNo}章` }}
        <span v-if="selectMode && rowHint(c)" class="hint">{{ rowHint(c) }}</span>
        <span v-else-if="c.status === 'event_extracted'" class="tick">✓</span>
        <span v-else-if="c.status === 'event_extracting'" class="spin"></span>
      </button>
      <div v-if="!loading && chapters.length === 0" class="empty" style="padding: 30px 12px">
        <span class="emptyti">暂无章节</span>
        <span style="font-size: 11.5px">导入小说正文后自动切分为章节</span>
        <button class="btn pri" @click="openImport">导入小说</button>
      </div>
    </aside>

    <!-- Canvas: prose + events -->
    <div class="canvas" style="overflow: hidden">
      <div class="novelcv">
        <div class="prose">
          <div class="prosein">
            <h2 class="ptitle">{{ activeChapter?.title || `第${activeChapter?.chapterNo ?? ''}章` }}</h2>
            <p v-for="(p, i) in paragraphs" :key="i" class="para">{{ p }}</p>
            <p v-if="!activeChapter" class="para" style="color: #9a9da4">选择左侧章节查看正文</p>
          </div>
        </div>
        <div class="evcol">
          <template v-if="events.length">
            <div class="thead" style="padding-left: 2px">事件 · {{ events.length }}</div>
            <button
              v-for="(e, i) in events"
              :key="e.id"
              :class="['ecard', i === activeEventIdx ? 'on' : '']"
              @click="activeEventIdx = i"
            >
              <span class="enum">事件 {{ String(e.eventNo).padStart(2, '0') }}</span>
              <span class="etitle">{{ e.summary }}</span>
              <span class="emeta">{{ e.eventType }} · 重要度 {{ e.importance }} · {{ e.location || '—' }}</span>
            </button>
          </template>
          <div v-else-if="eventsLoading" class="empty">
            <span class="spin" style="margin: 0; width: 18px; height: 18px"></span>
            <span class="emptyti">加载事件…</span>
          </div>
          <div v-else class="empty">
            <span class="emptyti">本章尚未提取事件</span>
            <span style="font-size: 11.5px">事件提取由 AI 后台任务生成</span>
            <button v-if="activeChapter" class="btn pri" :disabled="busy" @click="extractCurrent">
              提取本章事件
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Inspector -->
    <aside v-if="inspOn" class="insp">
      <template v-if="activeEvent">
        <p class="ihead">事件 {{ String(activeEvent.eventNo).padStart(2, '0') }}</p>
        <p class="ititle">{{ activeEvent.summary }}</p>
        <div class="frow"><span class="flabel">类型</span><span class="fval"><span class="chip">{{ activeEvent.eventType }}</span></span></div>
        <div class="frow"><span class="flabel">重要度</span><span class="fval">{{ activeEvent.importance }}</span></div>
        <div class="frow"><span class="flabel">冲突等级</span><span class="fval">{{ activeEvent.conflictLevel }}</span></div>
        <div class="frow"><span class="flabel">情绪</span><span class="fval">{{ activeEvent.emotionTone || '—' }}</span></div>
        <div class="frow"><span class="flabel">地点</span><span class="fval">{{ activeEvent.location || '—' }}</span></div>
        <div class="frow"><span class="flabel">人物</span><span class="fval">{{ eventCharacters(activeEvent) }}</span></div>
        <div class="sec">摘要</div>
        <p class="fval" style="font-size: 13px; margin: 0; line-height: 1.7">{{ activeEvent.detail }}</p>
      </template>
      <p v-else class="fval" style="color: #9a9da4; padding: 20px 0; text-align: center">
        在右侧选择一个事件,这里会显示它的属性
      </p>
    </aside>

    <!-- Import modal -->
    <div v-if="importOpen" class="mask" @click.self="closeImport">
      <div class="modal">
        <div class="mhd">
          <span class="mtitle">导入小说</span>
          <button class="mx" @click="closeImport">✕</button>
        </div>

        <div class="mtabs">
          <button :class="['mtab', src === 'paste' ? 'on' : '']" @click="src = 'paste'">粘贴文本</button>
          <button :class="['mtab', src === 'epub' ? 'on' : '']" @click="src = 'epub'">上传 EPUB</button>
        </div>

        <!-- Step 1: input -->
        <div v-if="!preview.length" class="mbody">
          <template v-if="src === 'paste'">
            <textarea
              v-model="pasteText"
              class="pastebox"
              placeholder="粘贴整篇小说正文,系统会按章节标题自动切分…"
            ></textarea>
          </template>
          <template v-else>
            <label class="drop">
              <input type="file" accept=".epub" hidden @change="onFile" />
              <span v-if="epubFile">{{ epubFile.name }}</span>
              <span v-else>点击选择 .epub 文件(≤ 30MB)</span>
            </label>
          </template>
        </div>

        <!-- Step 2: preview confirm -->
        <div v-else class="mbody">
          <p class="phint">
            已切分为 <b>{{ preview.length }}</b> 章
            <span v-if="epubMeta?.title">· {{ epubMeta.title }}</span>
            ,确认后追加到本项目
          </p>
          <div class="plist">
            <div v-for="(c, i) in preview" :key="i" class="prow">
              <span class="pno">{{ i + 1 }}</span>
              <span class="ptit">{{ c.title || '(无标题)' }}</span>
              <span class="pwc">{{ c.wordCount }} 字</span>
            </div>
          </div>
        </div>

        <div class="mft">
          <button v-if="preview.length" class="btn" :disabled="busy" @click="preview = []">← 返回修改</button>
          <div style="flex: 1"></div>
          <button class="btn" :disabled="busy" @click="closeImport">取消</button>
          <button
            v-if="!preview.length"
            class="btn pri"
            :disabled="busy || !canPreview"
            @click="doPreview"
          >
            {{ busy ? '解析中…' : '解析预览 →' }}
          </button>
          <button v-else class="btn pri" :disabled="busy" @click="doImport">
            {{ busy ? '导入中…' : `确认导入 ${preview.length} 章` }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, toRef, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { workbenchApi } from '@/api'
import type { Chapter, ChapterPreview, EpubMeta, NovelEvent } from '@/api/workbench'
import { useTaskStream } from '@/composables/useTaskStream'

const props = defineProps<{ projectId: string; inspOn: boolean }>()

const { tasks: streamTasks } = useTaskStream(toRef(props, 'projectId'))

const chapters = ref<Chapter[]>([])
const loading = ref(false)
const activeIdx = ref(0)
const busy = ref(false)

const events = ref<NovelEvent[]>([])
const eventsLoading = ref(false)
const activeEventIdx = ref(0)

// ---- Multi-select mode (batch extract / batch delete) ----
const selectMode = ref(false)
const selectedIds = ref<Set<string>>(new Set())
/** Highest chapterNo already planned into a batch — those chapters are locked. */
const plannedEndNo = ref(0)

/** Both batch actions share one selectable set: unplanned and not currently extracting. */
function selectable(c: Chapter): boolean {
  return c.chapterNo > plannedEndNo.value && c.status !== 'event_extracting'
}

function rowHint(c: Chapter): string {
  if (c.chapterNo <= plannedEndNo.value) return '已规划'
  if (c.status === 'event_extracting') return '提取中'
  return ''
}

const selectableChapters = computed(() => chapters.value.filter(selectable))
const allSelected = computed(
  () =>
    selectableChapters.value.length > 0 &&
    selectableChapters.value.every((c) => selectedIds.value.has(c.id)),
)

function enterSelectMode() {
  selectMode.value = true
  selectedIds.value = new Set()
}

function exitSelectMode() {
  selectMode.value = false
  selectedIds.value = new Set()
}

function toggleSelect(c: Chapter) {
  if (!selectable(c)) return
  const next = new Set(selectedIds.value)
  if (next.has(c.id)) {
    next.delete(c.id)
  } else {
    next.add(c.id)
  }
  selectedIds.value = next
}

function toggleSelectAll() {
  selectedIds.value = allSelected.value ? new Set() : new Set(selectableChapters.value.map((c) => c.id))
}

// ---- Import modal state ----
const importOpen = ref(false)
const src = ref<'paste' | 'epub'>('paste')
const pasteText = ref('')
const epubFile = ref<File | null>(null)
const preview = ref<ChapterPreview[]>([])
const epubMeta = ref<EpubMeta | null>(null)

const canPreview = computed(() =>
  src.value === 'paste' ? pasteText.value.trim().length > 0 : !!epubFile.value,
)

const activeChapter = computed(() => chapters.value[activeIdx.value] ?? null)
const paragraphs = computed(() =>
  (activeChapter.value?.content ?? '')
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean),
)
const activeEvent = computed(() => events.value[activeEventIdx.value] ?? null)

function eventCharacters(e: NovelEvent): string {
  try {
    const arr = JSON.parse(e.charactersJson)
    return Array.isArray(arr) && arr.length ? arr.map(String).join('、') : '—'
  } catch {
    return '—'
  }
}

async function loadChapters() {
  loading.value = true
  try {
    const [{ chapters: rows }, { batches }] = await Promise.all([
      workbenchApi.getChapters(props.projectId),
      workbenchApi.getBatches(props.projectId),
    ])
    chapters.value = rows
    plannedEndNo.value = batches.reduce((max, b) => Math.max(max, b.chapterEndNo), 0)
    if (rows.length) await selectChapter(Math.min(activeIdx.value, rows.length - 1))
  } finally {
    loading.value = false
  }
}

async function selectChapter(i: number) {
  activeIdx.value = i
  activeEventIdx.value = 0
  const chapter = chapters.value[i]
  if (!chapter) return
  eventsLoading.value = true
  events.value = []
  try {
    const { events: rows } = await workbenchApi.getChapterEvents(chapter.id)
    events.value = rows
  } catch {
    ElMessage.error('加载章节事件失败')
  } finally {
    eventsLoading.value = false
  }
}

// ---- Import flow ----
function openImport() {
  importOpen.value = true
  src.value = 'paste'
  pasteText.value = ''
  epubFile.value = null
  preview.value = []
  epubMeta.value = null
}

function closeImport() {
  if (busy.value) return
  importOpen.value = false
}

function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  epubFile.value = input.files?.[0] ?? null
}

async function doPreview() {
  busy.value = true
  try {
    const res =
      src.value === 'paste'
        ? await workbenchApi.previewChapters(pasteText.value)
        : await workbenchApi.previewEpub(epubFile.value!)
    if (!res.chapters.length) {
      ElMessage.warning('未能从输入中解析出任何章节')
      return
    }
    preview.value = res.chapters
    epubMeta.value = res.meta
  } finally {
    busy.value = false
  }
}

async function doImport() {
  busy.value = true
  try {
    await workbenchApi.importChapters(
      props.projectId,
      preview.value.map((c) => ({ title: c.title, content: c.content })),
      src.value === 'paste' ? 'paste' : 'epub',
    )
    ElMessage.success(`已导入 ${preview.value.length} 章`)
    importOpen.value = false
    await loadChapters()
  } finally {
    busy.value = false
  }
}

// ---- Event extraction ----
async function extractCurrent() {
  const chapter = activeChapter.value
  if (!chapter) return
  busy.value = true
  try {
    await workbenchApi.extractEvents(props.projectId, chapter.id)
    ElMessage.success('已提交事件提取任务,完成后自动刷新')
  } finally {
    busy.value = false
  }
}

async function extractAll() {
  const pending = chapters.value.filter((c) => selectable(c) && c.status !== 'event_extracted')
  if (!pending.length) {
    ElMessage.info('没有可提取的章节')
    return
  }
  busy.value = true
  try {
    const { tasks, skipped } = await workbenchApi.extractEventsBatch(
      props.projectId,
      pending.map((c) => c.id),
    )
    reportBatchExtraction(tasks.length, skipped.length)
  } finally {
    busy.value = false
  }
}

async function extractSelected() {
  const ids = [...selectedIds.value]
  if (!ids.length) return
  busy.value = true
  try {
    const { tasks, skipped } = await workbenchApi.extractEventsBatch(props.projectId, ids)
    reportBatchExtraction(tasks.length, skipped.length)
    exitSelectMode()
  } finally {
    busy.value = false
  }
}

function reportBatchExtraction(taskCount: number, skippedCount: number) {
  if (taskCount > 0) {
    ElMessage.success(`已为 ${taskCount} 章提交事件提取任务,完成后自动刷新`)
  }
  if (skippedCount > 0) {
    ElMessage.warning(`${skippedCount} 章被跳过(已规划或正在提取)`)
  }
}

async function deleteSelected() {
  const ids = [...selectedIds.value]
  if (!ids.length) return
  try {
    await ElMessageBox.confirm(
      `确定删除选中的 ${ids.length} 章?章节及其已提取事件将被删除,后续章节编号自动前移。`,
      '删除章节',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  busy.value = true
  try {
    const { deletedCount } = await workbenchApi.deleteChapters(props.projectId, ids)
    ElMessage.success(`已删除 ${deletedCount} 章`)
    exitSelectMode()
    activeIdx.value = 0
    await loadChapters()
  } finally {
    busy.value = false
  }
}

// Auto-refresh the current chapter's events when an extraction task completes.
// The event task doesn't carry a chapterId over SSE, so on any completion we
// refresh both the chapter list (for the ✓ marks) and the visible events.
watch(
  () =>
    streamTasks.value.filter((t) => t.taskType === 'event_extraction' && t.status === 'completed')
      .length,
  (now, prev) => {
    if (now > (prev ?? 0)) {
      loadChapters()
    }
  },
)

watch(() => props.projectId, loadChapters, { immediate: true })
</script>

<style scoped>
.pane {
  display: grid;
  grid-template-columns: 252px minmax(0, 1fr) 336px;
  overflow: hidden;
  flex: 1;
  min-height: 0;
}
.pane.noinsp {
  grid-template-columns: 252px minmax(0, 1fr);
}
.tree {
  background: #fbfbfa;
  border-right: 1px solid #e8e7e3;
  overflow: auto;
  padding: 14px 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.thead {
  font-size: 11px;
  font-weight: 600;
  color: #9a9da4;
  letter-spacing: 0.08em;
  padding: 2px 10px 8px;
}
.trow {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 6px;
  font-size: 13px;
  color: #3a3d44;
  cursor: pointer;
  border: 0;
  background: transparent;
  text-align: left;
  width: 100%;
  font-family: inherit;
}
.trow:hover {
  background: #f2f1ec;
}
.trow.on {
  background: #ecebe6;
  font-weight: 600;
  color: #1f2126;
}
.tick {
  color: #1a9e5c;
  font-size: 11px;
  margin-left: auto;
}
.spin {
  width: 11px;
  height: 11px;
  border: 2px solid #e2d2c8;
  border-top-color: #cf6134;
  border-radius: 50%;
  animation: rot 0.9s linear infinite;
  flex: none;
}
@keyframes rot {
  to {
    transform: rotate(360deg);
  }
}
.canvas {
  overflow: auto;
  min-width: 0;
}
.insp {
  background: #fff;
  border-left: 1px solid #e8e7e3;
  overflow: auto;
  padding: 20px 20px 36px;
}
.ihead {
  font-size: 11px;
  font-weight: 600;
  color: #9a9da4;
  letter-spacing: 0.08em;
  margin: 0 0 6px;
}
.ititle {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 4px;
}
.frow {
  padding: 8px 0;
  border-bottom: 1px solid #f2f1ee;
  font-size: 13px;
  display: flex;
  gap: 12px;
  align-items: baseline;
}
.flabel {
  color: #9a9da4;
  width: 62px;
  flex: none;
  font-size: 12px;
}
.fval {
  color: #2a2d33;
  line-height: 1.55;
}
.sec {
  font-size: 11px;
  font-weight: 600;
  color: #9a9da4;
  letter-spacing: 0.08em;
  margin: 20px 0 8px;
}
.chip {
  display: inline-flex;
  align-items: center;
  font-size: 11px;
  padding: 2px 9px;
  border-radius: 99px;
  background: #f1f0ed;
  color: #5c5f66;
  font-weight: 500;
}
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  height: 100%;
  color: #8a8d94;
  font-size: 13px;
  text-align: center;
  padding: 40px;
}
.emptyti {
  font-size: 15px;
  font-weight: 600;
  color: #4a4d54;
}

/* Novel mode */
.novelcv {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 372px;
  height: 100%;
}
.prose {
  overflow: auto;
  padding: 30px 38px;
}
.prosein {
  max-width: 660px;
  margin: 0 auto;
}
.ptitle {
  font-size: 18px;
  font-weight: 700;
  margin: 0 0 18px;
}
.para {
  font-size: 14.5px;
  line-height: 1.95;
  margin: 0 0 14px;
  color: #33363c;
}
.para.hl {
  background: #fbf1cf;
  box-shadow: 0 0 0 5px #fbf1cf;
  border-radius: 2px;
}
.evcol {
  border-left: 1px solid #e8e7e3;
  background: #f9f9f7;
  overflow: auto;
  padding: 20px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ecard {
  background: #fff;
  border: 1px solid #e8e7e3;
  border-radius: 8px;
  padding: 12px 14px;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ecard.on {
  border-color: #cf6134;
  box-shadow: 0 0 0 1px #cf6134;
}
.enum {
  font-size: 10.5px;
  color: #9a9da4;
}
.etitle {
  font-size: 13px;
  font-weight: 600;
  color: #1f2126;
  line-height: 1.4;
}
.emeta {
  font-size: 11.5px;
  color: #8a8d94;
}

/* Shared buttons */
.btn {
  border: 1px solid #dcdbd6;
  background: #fff;
  border-radius: 6px;
  padding: 6px 13px;
  font-size: 12.5px;
  cursor: pointer;
  color: #2a2d33;
  font-weight: 500;
  font-family: inherit;
}
.btn:hover {
  border-color: #c7c5bf;
}
.btn.pri {
  background: #cf6134;
  border-color: #cf6134;
  color: #fff;
}
.btn.pri:hover {
  background: #bb5329;
}
.btn[disabled] {
  cursor: not-allowed;
  opacity: 0.55;
}

/* Tree header + mini actions */
.treehd {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 10px 8px;
}
.mini {
  border: 1px solid #dcdbd6;
  background: #fff;
  border-radius: 6px;
  padding: 4px 9px;
  font-size: 11.5px;
  color: #5c5f66;
  cursor: pointer;
  font-family: inherit;
}
.mini:hover {
  border-color: #c7c5bf;
}
.mini[disabled] {
  cursor: not-allowed;
  opacity: 0.55;
}
.mini.blk {
  width: 100%;
  margin: 0 0 6px;
  color: #a4432f;
  font-weight: 600;
}
.mini.blk.danger {
  color: #c2372b;
  border-color: #e5c2bd;
}
.mini.blk.danger:hover:not([disabled]) {
  background: #fbf1ef;
  border-color: #c2372b;
}

/* Multi-select mode */
.selbar {
  display: flex;
  gap: 6px;
  margin: 0 0 6px;
}
.selbar .mini {
  flex: 1;
}
.trow.dis {
  opacity: 0.45;
  cursor: not-allowed;
}
.cb {
  flex: none;
  margin: 0;
  accent-color: #cf6134;
  cursor: pointer;
}
.cb[disabled] {
  cursor: not-allowed;
}
.hint {
  margin-left: auto;
  flex: none;
  font-size: 10.5px;
  color: #9a9da4;
}

/* Import modal */
.mask {
  position: fixed;
  inset: 0;
  background: rgba(31, 33, 38, 0.42);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.modal {
  width: 560px;
  max-width: calc(100vw - 40px);
  max-height: calc(100vh - 80px);
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.22);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.mhd {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #eeede9;
}
.mtitle {
  font-size: 15px;
  font-weight: 700;
}
.mx {
  border: 0;
  background: transparent;
  font-size: 15px;
  color: #9a9da4;
  cursor: pointer;
}
.mtabs {
  display: flex;
  gap: 3px;
  background: #f1f0ed;
  padding: 3px;
  border-radius: 8px;
  margin: 14px 20px 0;
}
.mtab {
  flex: 1;
  border: 0;
  background: transparent;
  padding: 7px 0;
  border-radius: 6px;
  font-size: 13px;
  color: #5c5f66;
  cursor: pointer;
  font-family: inherit;
}
.mtab.on {
  background: #fff;
  color: #1f2126;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.09);
  font-weight: 600;
}
.mbody {
  padding: 16px 20px;
  overflow: auto;
  flex: 1;
}
.pastebox {
  width: 100%;
  height: 260px;
  box-sizing: border-box;
  border: 1px solid #e2e1dc;
  border-radius: 8px;
  padding: 12px 14px;
  font-size: 13px;
  line-height: 1.7;
  resize: vertical;
  font-family: inherit;
  color: #2e3138;
}
.pastebox:focus {
  outline: none;
  border-color: #cf6134;
}
.drop {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 160px;
  border: 1.5px dashed #d6d5cf;
  border-radius: 10px;
  color: #8a8d94;
  font-size: 13px;
  cursor: pointer;
  text-align: center;
  padding: 0 20px;
}
.drop:hover {
  border-color: #cf6134;
  color: #a4432f;
}
.phint {
  font-size: 13px;
  color: #5c5f66;
  margin: 0 0 12px;
}
.plist {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 300px;
  overflow: auto;
}
.prow {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  border-radius: 6px;
  background: #f9f9f7;
  font-size: 12.5px;
}
.pno {
  width: 22px;
  color: #9a9da4;
  flex: none;
  text-align: right;
}
.ptit {
  flex: 1;
  color: #2e3138;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pwc {
  color: #8a8d94;
  flex: none;
  font-size: 11.5px;
}
.mft {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid #eeede9;
}
</style>
