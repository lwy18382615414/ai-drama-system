<template>
  <div class="wb">
    <!-- Top bar -->
    <header class="top">
      <button class="pjbtn" @click="pjOpen = !pjOpen">
        <span class="back">◀</span>{{ project?.title ?? '项目' }}<span class="caret">▾</span>
      </button>

      <nav class="tabs">
        <button
          v-for="t in tabs"
          :key="t.key"
          :class="['tab', mode === t.key ? 'on' : '']"
          @click="mode = t.key"
        >
          {{ t.label }}
          <span v-if="t.dot" :class="['tdot', t.dotCls]">●</span>
        </button>
      </nav>

      <div class="f1"></div>

      <button class="taskbtn" @click="drawerOpen = !drawerOpen">
        ⚡ {{ activeCount > 0 ? `${activeCount} 个任务进行中` : '任务中心' }}
      </button>
      <button class="iconbtn" title="显示/隐藏属性栏" @click="inspOn = !inspOn">⚙</button>

      <!-- Project dropdown -->
      <div v-if="pjOpen" class="pjdrop">
        <p class="pjname">{{ project?.title }}</p>
        <p class="pjsub">
          {{ project?.genre }} · {{ project?.episodeCount ?? 0 }} 集 · 创建于
          {{ createdDate }}
        </p>
        <div class="sec" style="margin: 0">阶段统计</div>
        <div class="statrow">
          <span class="chip">章节 {{ project?.chapterCount ?? 0 }}</span>
          <span class="chip">事件 {{ project?.eventCount ?? 0 }}</span>
          <span class="chip">剧集 {{ project?.episodeCount ?? 0 }}</span>
          <span class="chip">镜头 {{ project?.storyboardCount ?? 0 }}</span>
        </div>
        <div class="sec">图片完成率</div>
        <div class="brow">
          <span class="blabel">整体出图</span>
          <div class="bar"><div class="barf" :style="{ width: `${project?.imageCompletion ?? 0}%` }"></div></div>
          <span class="bnum">{{ project?.imageCompletion ?? 0 }}%</span>
        </div>
        <div class="brow">
          <span class="blabel">已生成 / 目标</span>
          <div class="bar"><div class="barf" :style="{ width: `${imageRatio}%` }"></div></div>
          <span class="bnum">{{ project?.completedImages ?? 0 }}/{{ imageTarget }}</span>
        </div>
        <div class="divider"></div>
        <div style="display: flex; justify-content: space-between; align-items: center">
          <button class="linkbtn" @click="backToList">← 返回项目列表</button>
        </div>
      </div>
    </header>

    <div class="wb-body">
      <!-- Guide bar -->
      <div v-if="guide" :class="['guide', guide.cls]">
        <span>{{ guide.icon }}</span>
        <span class="gtxt">{{ guide.text }}</span>
        <button v-if="guide.action" class="btn pri" @click="mode = guide.action.tab">
          {{ guide.action.label }}
        </button>
      </div>

      <!-- Active pane -->
      <keep-alive>
        <component :is="activePane" :project-id="projectId" :insp-on="inspOn" />
      </keep-alive>
    </div>

    <!-- Task drawer -->
    <TaskDrawer v-model="drawerOpen" :tasks="tasks" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { projectApi } from '@/api'
import type { ProjectDetail } from '@/api/projects'
import { useTaskStream } from '@/composables/useTaskStream'
import NovelPane from './workbench/NovelPane.vue'
import ScriptPane from './workbench/ScriptPane.vue'
import BoardPane from './workbench/BoardPane.vue'
import AssetsPane from './workbench/AssetsPane.vue'
import TaskDrawer from './workbench/TaskDrawer.vue'

const props = defineProps<{ projectId: string }>()
const router = useRouter()

type Mode = 'novel' | 'script' | 'board' | 'assets'
const mode = ref<Mode>('novel')
const inspOn = ref(true)
const pjOpen = ref(false)
const drawerOpen = ref(false)

const project = ref<ProjectDetail | null>(null)

// One SSE connection per project, shared with panes through the useTaskStream
// registry — each pane calls the hook itself rather than injecting it here.
const projectRef = computed(() => props.projectId)
const { tasks, activeCount } = useTaskStream(projectRef)

const PANES = { novel: NovelPane, script: ScriptPane, board: BoardPane, assets: AssetsPane }
const activePane = computed(() => PANES[mode.value])

const tabs = computed(() => {
  const p = project.value
  return [
    { key: 'novel' as Mode, label: '小说', dot: false, dotCls: '' },
    { key: 'script' as Mode, label: '剧本', dot: false, dotCls: '' },
    {
      key: 'board' as Mode,
      label: '分镜',
      dot: !!p && p.storyboardEpisodeCount < p.episodeCount,
      dotCls: 'run',
    },
    {
      key: 'assets' as Mode,
      label: '资产',
      dot: !!p && p.imageCompletion >= 100 && p.imageCompletion > 0,
      dotCls: 'ok',
    },
  ]
})

const createdDate = computed(() =>
  project.value ? new Date(project.value.createdAt).toLocaleDateString('zh-CN') : '',
)
const imageTarget = computed(() => {
  const p = project.value
  return p ? p.characterCount + p.sceneCount + p.storyboardCount : 0
})
const imageRatio = computed(() => {
  const target = imageTarget.value
  return target === 0 ? 0 : Math.round(((project.value?.completedImages ?? 0) / target) * 100)
})

// Data-derived "smart next step" guide, batch-aware. Failed tasks take priority.
// The pipeline is: import chapters → extract events → plan a batch → scripts →
// storyboards → images, and it loops (extract more chapters → plan the next batch).
const guide = computed(() => {
  if (tasks.value.some((t) => t.status === 'failed')) {
    return { cls: 'warn', icon: '⚠', text: '有生成任务失败,可在任务中心查看原因并重试', action: null }
  }
  const p = project.value
  if (!p) return null

  if (p.chapterCount === 0)
    return { cls: '', icon: '💡', text: '下一步 · 还没有小说章节', action: null }

  // Chapters extracted but not yet planned into a batch.
  const unplannedExtracted = p.extractedChapterCount - p.plannedChapterEndNo
  if (p.batchCount === 0 && p.extractedChapterCount === 0)
    return { cls: '', icon: '💡', text: '下一步 · 章节尚未提取事件', action: { tab: 'novel' as Mode, label: '前往小说 →' } }
  if (unplannedExtracted > 0)
    return {
      cls: '',
      icon: '💡',
      text: `下一步 · 第 ${p.plannedChapterEndNo + 1}-${p.extractedChapterCount} 章已提取,可规划为批次 ${p.batchCount + 1}`,
      action: { tab: 'script' as Mode, label: '规划批次 →' },
    }

  // Batches exist — walk the production pipeline for the episodes they produced.
  if (p.episodeCount === 0)
    return { cls: '', icon: '💡', text: '下一步 · 尚未规划剧集', action: { tab: 'script' as Mode, label: '前往剧本' } }
  if (p.scriptCount < p.episodeCount)
    return { cls: '', icon: '💡', text: `下一步 · 还有 ${p.episodeCount - p.scriptCount} 集尚无剧本`, action: { tab: 'script' as Mode, label: '生成剧本 →' } }
  if (p.storyboardEpisodeCount < p.episodeCount)
    return { cls: '', icon: '💡', text: `下一步 · 还有 ${p.episodeCount - p.storyboardEpisodeCount} 集尚无分镜`, action: { tab: 'board' as Mode, label: '生成分镜 →' } }
  if (p.imageCompletion < 100)
    return { cls: '', icon: '💡', text: `下一步 · 出图完成度 ${p.imageCompletion}%`, action: { tab: 'board' as Mode, label: '前往分镜' } }

  // Current batches fully produced — nudge toward the next batch if chapters remain.
  if (p.chapterCount > p.plannedChapterEndNo)
    return {
      cls: 'ok',
      icon: '✓',
      text: `当前批次素材已齐 · 可提取第 ${p.plannedChapterEndNo + 1} 章起的事件,开启下一批`,
      action: { tab: 'novel' as Mode, label: '前往小说 →' },
    }
  return { cls: 'ok', icon: '✓', text: '本项目素材已齐 — 剧本、分镜与首帧图全部生成完成', action: null }
})

function backToList() {
  router.push({ name: 'projects' })
}

async function loadProject() {
  const { project: detail } = await projectApi.getProject(props.projectId)
  project.value = detail
}

watch(() => props.projectId, loadProject, { immediate: true })
</script>

<style scoped>
.wb {
  height: 100vh;
  min-width: 0;
  color: #1f2126;
  background: #f6f6f4;
  font-family: -apple-system, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', system-ui,
    sans-serif;
  -webkit-font-smoothing: antialiased;
  display: grid;
  grid-template-rows: 52px 1fr;
  overflow: hidden;
}

/* Body below the top bar: optional guide bar + the active pane which fills the rest. */
.wb-body {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

/* Top bar */
.top {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 0 20px;
  background: #fff;
  border-bottom: 1px solid #e8e7e3;
  position: relative;
  z-index: 30;
}
.pjbtn {
  border: 0;
  background: transparent;
  font-size: 14px;
  font-weight: 600;
  color: #1f2126;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 6px 8px;
  border-radius: 6px;
}
.pjbtn:hover {
  background: #f4f3ef;
}
.back {
  color: #9a9da4;
  font-size: 12px;
}
.caret {
  color: #9a9da4;
  font-size: 10px;
}
.tabs {
  display: flex;
  gap: 3px;
  background: #f1f0ed;
  padding: 3px;
  border-radius: 8px;
}
.tab {
  border: 0;
  background: transparent;
  padding: 6px 15px;
  border-radius: 6px;
  font-size: 13px;
  color: #5c5f66;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: inherit;
}
.tab.on {
  background: #fff;
  color: #1f2126;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.09);
  font-weight: 600;
}
.tdot {
  font-size: 8px;
  line-height: 1;
}
.tdot.ok {
  color: #1a9e5c;
}
.tdot.run {
  color: #cf6134;
}
.f1 {
  flex: 1;
}
.taskbtn {
  border: 1px solid #dcdbd6;
  background: #fff;
  border-radius: 6px;
  padding: 5px 11px;
  font-size: 12.5px;
  cursor: pointer;
  color: #a4432f;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 5px;
}
.iconbtn {
  border: 0;
  background: transparent;
  font-size: 15px;
  color: #8a8d94;
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
}
.iconbtn:hover {
  background: #f4f3ef;
}

/* Project dropdown */
.pjdrop {
  position: absolute;
  top: 47px;
  left: 14px;
  width: 340px;
  background: #fff;
  border: 1px solid #e8e7e3;
  border-radius: 10px;
  box-shadow: 0 10px 34px rgba(0, 0, 0, 0.12);
  z-index: 40;
  padding: 18px;
}
.pjname {
  font-size: 15px;
  font-weight: 700;
  margin: 0 0 2px;
}
.pjsub {
  font-size: 12px;
  color: #8a8d94;
  margin: 0 0 14px;
}
.sec {
  font-size: 11px;
  font-weight: 600;
  color: #9a9da4;
  letter-spacing: 0.08em;
  margin: 20px 0 8px;
}
.statrow {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 8px;
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
.brow {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: #5c5f66;
  margin-bottom: 8px;
}
.blabel {
  width: 96px;
  flex: none;
}
.bar {
  height: 5px;
  border-radius: 3px;
  background: #eeede9;
  overflow: hidden;
  flex: 1;
}
.barf {
  height: 100%;
  background: #cf6134;
  border-radius: 3px;
}
.bnum {
  width: 44px;
  text-align: right;
  color: #8a8d94;
  font-size: 11px;
}
.divider {
  height: 1px;
  background: #f0efec;
  margin: 14px 0;
}
.linkbtn {
  border: 0;
  background: transparent;
  color: #6b6f76;
  font-size: 12.5px;
  cursor: pointer;
  padding: 6px 10px;
  border-radius: 6px;
  text-align: left;
  font-family: inherit;
}
.linkbtn:hover {
  background: #f2f1ec;
}

/* Guide bar */
.guide {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 8px 22px;
  background: #fbeee7;
  border-bottom: 1px solid #f5ddd0;
  font-size: 13px;
  color: #8c4a2e;
}
.guide.ok {
  background: #ecf7f0;
  border-color: #d8ecdf;
  color: #1f6b43;
}
.guide.warn {
  background: #fdf0ee;
  border-color: #f5ddd8;
  color: #8c3a2e;
}
.gtxt {
  font-weight: 500;
  flex: 1;
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
.btn.pri {
  background: #cf6134;
  border-color: #cf6134;
  color: #fff;
}
.btn.pri:hover {
  background: #bb5329;
}
</style>
