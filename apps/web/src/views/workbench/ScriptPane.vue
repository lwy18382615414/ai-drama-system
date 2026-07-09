<template>
  <div :class="['pane', inspOn ? '' : 'noinsp']">
    <!-- Batches + Episodes tree -->
    <aside class="tree">
      <div class="thead" style="display: flex; align-items: center; justify-content: space-between">
        <span style="padding: 0">批次</span>
        <button
          v-if="canPlanMore"
          class="mini"
          :disabled="busy"
          @click="openPlanner"
        >
          规划新批次
        </button>
      </div>

      <div v-for="b in batches" :key="b.id" class="bcard">
        <div class="brow">
          <span class="bno">第{{ b.batchNo }}批</span>
          <span v-if="b.status === 'replanning'" class="bstate run">重规划中…</span>
          <span v-else-if="b.status === 'failed'" class="bstate warn">失败</span>
          <button
            v-else
            class="mini danger"
            :disabled="busy"
            title="删除本批次剧集与剧本/分镜后重新规划(角色/场景/道具库保留)"
            @click="replan(b)"
          >
            重新规划
          </button>
        </div>
        <div class="bmeta">第{{ b.chapterStartNo }}-{{ b.chapterEndNo }}章 → 第{{ b.episodeStartNo }}-{{ b.episodeEndNo }}集</div>
      </div>

      <!-- Inline "plan next batch" selector -->
      <div v-if="plannerOpen" class="planner">
        <div class="pl-lock">起始章节 · 第 {{ nextChapterStart }} 章 <span class="pl-hint">(自动接续)</span></div>
        <label class="pl-end">
          结束章节
          <input
            v-model.number="plannerEnd"
            type="number"
            :min="nextChapterStart"
            :max="maxChapterNo"
            class="pl-input"
          />
        </label>
        <div class="pl-actions">
          <button class="mini" :disabled="busy" @click="plannerOpen = false">取消</button>
          <button class="mini pri" :disabled="busy || !plannerEndValid" @click="submitPlan">
            {{ busy ? '提交中…' : `规划第 ${nextChapterStart}-${plannerEnd} 章` }}
          </button>
        </div>
      </div>

      <div v-if="!batchesLoading && batches.length === 0 && !plannerOpen" class="thead" style="padding-top: 8px; font-weight: 400">
        暂无批次 · 先在小说页提取事件,再规划批次
      </div>

      <div class="thead" style="margin-top: 14px">剧集</div>
      <button
        v-for="(e, i) in episodes"
        :key="e.id"
        :class="['trow', i === activeIdx ? 'on' : '']"
        @click="selectEpisode(i)"
      >
        {{ e.title || `第${e.episodeNo}集` }}
        <span v-if="e.scriptId" class="tick">✓</span>
      </button>
      <div v-if="!loading && episodes.length === 0" class="thead" style="padding-top: 8px; font-weight: 400">
        暂无剧集
      </div>
    </aside>

    <!-- Canvas -->
    <div class="canvas">
      <div v-if="scriptLoading" class="empty">
        <span class="spin" style="margin: 0; width: 18px; height: 18px"></span>
        <span class="emptyti">加载剧本…</span>
      </div>
      <div v-else-if="script" class="scriptwrap">
        <div class="scripthd">
          <button class="btn" :disabled="busy" @click="regenerate">重新生成</button>
        </div>
        <div class="script">{{ script.content }}</div>
      </div>
      <div v-else-if="activeEpisode" class="empty">
        <span class="emptyti">{{ episodeTitle }} 尚无剧本</span>
        <span style="max-width: 340px; line-height: 1.7">
          将基于本集关联的来源事件生成初稿,生成后可在此查看
        </span>
        <button class="btn pri" :disabled="busy" @click="generate">✨ 生成剧本</button>
      </div>
      <div v-else class="empty"><span class="emptyti">选择左侧剧集</span></div>
    </div>

    <!-- Inspector -->
    <aside v-if="inspOn" class="insp">
      <template v-if="activeEpisode">
        <p class="ihead">本集信息</p>
        <p class="ititle">{{ episodeTitle }}</p>
        <div class="frow">
          <span class="flabel">状态</span>
          <span class="fval">
            <span :class="['chip', script ? 'ok' : '']">{{ script ? '剧本已生成' : '尚无剧本' }}</span>
          </span>
        </div>
        <div class="frow"><span class="flabel">梗概</span><span class="fval">{{ activeEpisode.summary || '—' }}</span></div>

        <div class="sec">来源事件链</div>
        <div v-if="sourceEvents.length" style="display: flex; flex-direction: column; gap: 8px">
          <div v-for="s in sourceEvents" :key="s.linkId" class="pblock">
            {{ s.orderInEpisode + 1 }}. {{ s.event.summary }}
          </div>
        </div>
        <p v-else class="fval" style="color: #9a9da4; text-align: left; padding: 4px 0">
          本集暂无关联事件
        </p>

        <EpisodePipeline
          :episode="activeEpisode"
          @navigate="$emit('navigate', $event)"
          @changed="refreshAfterScript"
        />
      </template>
      <p v-else class="fval" style="color: #9a9da4; padding: 20px 0; text-align: center">
        选择左侧剧集查看信息
      </p>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, toRef, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { workbenchApi } from '@/api'
import type { Batch, Chapter, Episode, EpisodeEventLink, Script } from '@/api/workbench'
import { useTaskStream } from '@/composables/useTaskStream'
import EpisodePipeline from './EpisodePipeline.vue'

const props = defineProps<{ projectId: string; inspOn: boolean }>()
defineEmits<{ (e: 'navigate', tab: 'script' | 'assets' | 'board'): void }>()

const { tasks: streamTasks } = useTaskStream(toRef(props, 'projectId'))

const episodes = ref<Episode[]>([])
const loading = ref(false)
const activeIdx = ref(0)

const batches = ref<Batch[]>([])
const batchesLoading = ref(false)
const chapters = ref<Chapter[]>([])

const plannerOpen = ref(false)
const plannerEnd = ref<number | null>(null)

const script = ref<Script | null>(null)
const scriptLoading = ref(false)
const sourceEvents = ref<EpisodeEventLink[]>([])
const busy = ref(false)

const activeEpisode = computed(() => episodes.value[activeIdx.value] ?? null)
const episodeTitle = computed(
  () => activeEpisode.value?.title || `第${activeEpisode.value?.episodeNo ?? ''}集`,
)

const maxChapterNo = computed(() =>
  chapters.value.reduce((max, c) => Math.max(max, c.chapterNo), 0),
)
// Chapter start of the next batch is locked to the last batch's end + 1.
const nextChapterStart = computed(() => {
  const last = batches.value.at(-1)
  return (last?.chapterEndNo ?? 0) + 1
})
const canPlanMore = computed(() => nextChapterStart.value <= maxChapterNo.value)
const plannerEndValid = computed(
  () =>
    plannerEnd.value != null &&
    plannerEnd.value >= nextChapterStart.value &&
    plannerEnd.value <= maxChapterNo.value,
)

async function loadEpisodes() {
  loading.value = true
  try {
    const { episodes: rows } = await workbenchApi.getEpisodes(props.projectId)
    episodes.value = rows
    if (rows.length) await selectEpisode(0)
  } finally {
    loading.value = false
  }
}

async function loadBatches() {
  batchesLoading.value = true
  try {
    const [batchRes, chapterRes] = await Promise.all([
      workbenchApi.getBatches(props.projectId),
      workbenchApi.getChapters(props.projectId),
    ])
    batches.value = batchRes.batches
    chapters.value = chapterRes.chapters
  } finally {
    batchesLoading.value = false
  }
}

function openPlanner() {
  plannerOpen.value = true
  plannerEnd.value = maxChapterNo.value
}

async function submitPlan() {
  if (!plannerEndValid.value || plannerEnd.value == null) return
  busy.value = true
  try {
    // 422 (unextracted chapters in range) auto-toasts its message listing chapter numbers.
    await workbenchApi.createBatch(props.projectId, plannerEnd.value)
    ElMessage.success('已提交批次规划任务,完成后自动刷新')
    plannerOpen.value = false
    await loadBatches()
  } finally {
    busy.value = false
  }
}

async function replan(batch: Batch) {
  try {
    await ElMessageBox.confirm(
      `将删除第${batch.batchNo}批的剧集、剧本、分镜及其首帧图后重新规划。角色/场景/道具库及参考图会保留。继续?`,
      '重新规划批次',
      { type: 'warning', confirmButtonText: '重新规划', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  busy.value = true
  try {
    await workbenchApi.replanBatch(props.projectId, batch.id)
    ElMessage.success('已提交重新规划任务,完成后自动刷新')
    await loadBatches()
  } finally {
    busy.value = false
  }
}

// Reload the episode list (so per-episode script ticks / scriptId refresh) while
// preserving the current selection, then re-fetch the active episode's script so
// its content回显 without the user having to switch episodes.
async function refreshAfterScript() {
  const activeId = activeEpisode.value?.id
  const { episodes: rows } = await workbenchApi.getEpisodes(props.projectId)
  episodes.value = rows
  const idx = activeId ? rows.findIndex((e) => e.id === activeId) : -1
  if (idx >= 0) await selectEpisode(idx)
}

async function selectEpisode(i: number) {
  activeIdx.value = i
  const ep = episodes.value[i]
  if (!ep) return
  scriptLoading.value = true
  script.value = null
  sourceEvents.value = []
  try {
    // The episode may not have a script yet; the server returns `script: null` for that.
    const [scriptRes, eventsRes] = await Promise.allSettled([
      workbenchApi.getEpisodeScript(ep.id),
      workbenchApi.getEpisodeEvents(ep.id),
    ])
    if (scriptRes.status === 'fulfilled') {
      script.value = scriptRes.value.script
    } else {
      ElMessage.error('加载剧本失败')
    }
    if (eventsRes.status === 'fulfilled') sourceEvents.value = eventsRes.value.events
  } finally {
    scriptLoading.value = false
  }
}

async function generate() {
  const ep = activeEpisode.value
  if (!ep) return
  busy.value = true
  try {
    await workbenchApi.generateScript(ep.id)
    ElMessage.success('已提交剧本生成任务,可在任务中心查看进度')
  } finally {
    busy.value = false
  }
}

async function regenerate() {
  await generate()
}

// Refresh batches + episodes whenever an episode_planning task completes.
watch(
  () =>
    streamTasks.value.filter((t) => t.taskType === 'episode_planning' && t.status === 'completed')
      .length,
  (now, prev) => {
    if (now > (prev ?? 0)) {
      loadBatches()
      loadEpisodes()
    }
  },
)

// Refresh the episode list + active script whenever a script_generation task
// completes, so the tree's script tick and the canvas content回显 without a manual
// episode switch.
watch(
  () =>
    streamTasks.value.filter((t) => t.taskType === 'script_generation' && t.status === 'completed')
      .length,
  (now, prev) => {
    if (now > (prev ?? 0)) refreshAfterScript()
  },
)

// Refresh the episode list whenever an asset-extraction task completes, so the
// pipeline stepper's 资产 step flips to done without a manual reload.
watch(
  () =>
    streamTasks.value.filter((t) => t.taskType === 'asset_extraction' && t.status === 'completed')
      .length,
  (now, prev) => {
    if (now > (prev ?? 0)) refreshAfterScript()
  },
)

watch(
  () => props.projectId,
  () => {
    plannerOpen.value = false
    loadBatches()
    loadEpisodes()
  },
  { immediate: true },
)
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
.chip.ok {
  background: #e2f5ea;
  color: #177a48;
}
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
.btn.blk {
  width: 100%;
  margin-top: 2px;
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
.pblock {
  background: #f7f7f4;
  border: 1px solid #ececec;
  border-radius: 7px;
  padding: 10px 12px;
  font-size: 11.5px;
  line-height: 1.7;
  color: #4a4d54;
  white-space: pre-wrap;
  word-break: break-word;
}

/* Batch section */
.mini {
  border: 1px solid #dcdbd6;
  background: #fff;
  border-radius: 6px;
  padding: 3px 8px;
  font-size: 11px;
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
.mini.pri {
  background: #cf6134;
  border-color: #cf6134;
  color: #fff;
}
.mini.danger {
  color: #a4432f;
}
.bcard {
  background: #fff;
  border: 1px solid #ececea;
  border-radius: 8px;
  padding: 9px 11px;
  margin-bottom: 6px;
}
.brow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.bno {
  font-size: 12.5px;
  font-weight: 600;
  color: #1f2126;
}
.bstate {
  font-size: 11px;
  font-weight: 500;
}
.bstate.run {
  color: #cf6134;
}
.bstate.warn {
  color: #a4432f;
}
.bmeta {
  font-size: 11px;
  color: #8a8d94;
  margin-top: 5px;
}
.planner {
  background: #fbf8f4;
  border: 1px solid #ecdfd4;
  border-radius: 8px;
  padding: 11px;
  margin-bottom: 6px;
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.pl-lock {
  font-size: 12px;
  color: #5c5f66;
  font-weight: 500;
}
.pl-hint {
  color: #a9a49d;
  font-weight: 400;
}
.pl-end {
  font-size: 11px;
  color: #8a8d94;
  display: flex;
  align-items: center;
  gap: 8px;
}
.pl-input {
  width: 64px;
  border: 1px solid #dcdbd6;
  border-radius: 5px;
  padding: 4px 7px;
  font-size: 12.5px;
  font-family: inherit;
  color: #2e3138;
}
.pl-input:focus {
  outline: none;
  border-color: #cf6134;
}
.pl-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

/* Script mode */
.scriptwrap {
  padding: 28px 38px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  align-items: center;
}
.scripthd {
  display: flex;
  gap: 10px;
  width: 100%;
  max-width: 780px;
  justify-content: flex-end;
}
.script {
  background: #fff;
  border: 1px solid #e8e7e3;
  border-radius: 10px;
  padding: 34px 42px;
  font-size: 14px;
  line-height: 2;
  white-space: pre-wrap;
  width: 100%;
  max-width: 780px;
  box-sizing: border-box;
  color: #2e3138;
}
</style>
