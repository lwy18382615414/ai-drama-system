<script setup lang="ts">
import { computed, provide, reactive, watch } from 'vue'
import { useRoute } from 'vue-router'
import { createWorkbenchStore, type Mode, type ModeStatus } from '@/composables/useWorkbenchStore'
import { WorkbenchKey } from '@/composables/workbenchKey'
import { useTaskCenter } from '@/store/taskCenter'
import type { ProjectDetail } from '@/api/projects'
import ProjectDropdown from '@/components/workbench/ProjectDropdown.vue'
import TaskDrawer from '@/components/workbench/TaskDrawer.vue'
import EditProjectModal from '@/components/EditProjectModal.vue'
import NovelMode from '@/components/workbench/NovelMode.vue'
import ScriptMode from '@/components/workbench/ScriptMode.vue'
import StoryboardMode from '@/components/workbench/StoryboardMode.vue'
import AssetsMode from '@/components/workbench/AssetsMode.vue'

const route = useRoute()
const projectId = computed(() => route.params.id as string)

const wb = createWorkbenchStore(projectId.value)
provide(WorkbenchKey, wb)

const taskCenter = useTaskCenter()

const ui = reactive({
  mode: 'novel' as Mode,
  novelChapterId: '',
  novelEventId: '',
  scriptEpisodeId: '',
  boardEpisodeId: '',
  boardShotId: '',
  assetsCategory: 'characters' as 'characters' | 'scenes' | 'props',
  assetsSelectedId: '',
  pjOpen: false,
  inspectorCollapsed: false,
  editOpen: false,
  guideDismissed: false,
})

watch(
  () => wb.guide.value.kind,
  (kind) => {
    if (kind !== 'done') ui.guideDismissed = false
  },
)

const TABS: Array<{ key: Mode; label: string }> = [
  { key: 'novel', label: '小说' },
  { key: 'script', label: '剧本' },
  { key: 'board', label: '分镜' },
  { key: 'assets', label: '资产' },
]

const DOT: Record<ModeStatus, { char: string; cls: string }> = {
  none: { char: '', cls: 'wb-tdot' },
  ok: { char: '✓', cls: 'wb-tdot ok' },
  run: { char: '●', cls: 'wb-tdot run' },
  warn: { char: '⚠', cls: 'wb-tdot warn' },
}

function togglePj() {
  ui.pjOpen = !ui.pjOpen
  if (ui.pjOpen) taskCenter.drawerOpen.value = false
}

function toggleDrawer() {
  taskCenter.toggleDrawer()
  if (taskCenter.drawerOpen.value) ui.pjOpen = false
}

function onGuideCta() {
  const g = wb.guide.value
  if (g.target) {
    ui.mode = g.target.mode
    if (g.target.chapterId) {
      ui.novelChapterId = g.target.chapterId
      ui.novelEventId = ''
    }
    if (g.target.episodeId) {
      if (g.target.mode === 'script') ui.scriptEpisodeId = g.target.episodeId
      if (g.target.mode === 'board') ui.boardEpisodeId = g.target.episodeId
    }
  }
  g.action?.()
}

function onGuideQuick() {
  wb.guide.value.quickAction?.()
}

function onGuideRetry() {
  wb.retryFailedTask(wb.guide.value.failedTask)
}

function onGuideViewReason() {
  if (!taskCenter.drawerOpen.value) toggleDrawer()
}

function onJumpToCharacter(characterId: string) {
  ui.mode = 'assets'
  ui.assetsCategory = 'characters'
  ui.assetsSelectedId = characterId
}

function onEditSaved(project: ProjectDetail) {
  wb.state.project = project
}
</script>

<template>
  <div class="wb-root">
    <div class="wb-app" data-screen-label="工作台">
      <header class="wb-top">
        <button class="wb-pjbtn" @click="togglePj">
          <span class="wb-back">◀</span>{{ wb.state.project?.title ?? '' }}<span class="wb-caret">▾</span>
        </button>
        <nav class="wb-tabs">
          <button
            v-for="t in TABS"
            :key="t.key"
            :class="['wb-tab', { on: ui.mode === t.key }]"
            @click="ui.mode = t.key"
          >
            {{ t.label }}<span :class="DOT[wb.modeStatus.value[t.key]].cls">{{ DOT[wb.modeStatus.value[t.key]].char }}</span>
          </button>
        </nav>
        <div class="wb-f1" />
        <button
          class="wb-iconbtn"
          :title="ui.inspectorCollapsed ? '展开检查器' : '收起检查器'"
          @click="ui.inspectorCollapsed = !ui.inspectorCollapsed"
        >▤</button>
        <button class="wb-taskbtn" @click="toggleDrawer">⚡ {{ taskCenter.runningCount.value }} 个任务进行中</button>
        <button class="wb-iconbtn">⚙</button>

        <ProjectDropdown v-if="ui.pjOpen" @close="ui.pjOpen = false" @edit="ui.editOpen = true; ui.pjOpen = false" />
      </header>

      <div v-if="wb.guide.value.kind === 'next'" class="wb-guide">
        <span class="wb-gicon">💡</span>
        <span class="wb-gtxt">下一步 · {{ wb.guide.value.text }}</span>
        <button class="wb-btn pri" @click="onGuideCta">{{ wb.guide.value.ctaLabel }}</button>
        <button v-if="wb.guide.value.quickAction" class="wb-btn" @click="onGuideQuick">{{ wb.guide.value.quickLabel }}</button>
      </div>
      <div v-else-if="wb.guide.value.kind === 'fail'" class="wb-guide warn">
        <span class="wb-gicon">⚠</span>
        <span class="wb-gtxt">{{ wb.guide.value.text }}</span>
        <button class="wb-btn" @click="onGuideViewReason">查看原因</button>
        <button class="wb-btn pri" @click="onGuideRetry">重试</button>
      </div>
      <div v-else-if="!ui.guideDismissed" class="wb-guide ok">
        <span class="wb-gicon">✓</span>
        <span class="wb-gtxt">{{ wb.guide.value.text }}</span>
        <button class="wb-btn" @click="ui.guideDismissed = true">收起</button>
      </div>

      <NovelMode
        v-if="ui.mode === 'novel'"
        v-model:chapter-id="ui.novelChapterId"
        v-model:event-id="ui.novelEventId"
        :inspector-collapsed="ui.inspectorCollapsed"
      />
      <ScriptMode
        v-else-if="ui.mode === 'script'"
        v-model:episode-id="ui.scriptEpisodeId"
        :inspector-collapsed="ui.inspectorCollapsed"
      />
      <StoryboardMode
        v-else-if="ui.mode === 'board'"
        v-model:episode-id="ui.boardEpisodeId"
        v-model:shot-id="ui.boardShotId"
        :inspector-collapsed="ui.inspectorCollapsed"
        @jump-to-character="onJumpToCharacter"
      />
      <AssetsMode
        v-else
        v-model:category="ui.assetsCategory"
        v-model:asset-id="ui.assetsSelectedId"
        :inspector-collapsed="ui.inspectorCollapsed"
      />
    </div>

    <TaskDrawer v-if="taskCenter.drawerOpen.value" />
    <EditProjectModal v-if="wb.state.project" v-model:show="ui.editOpen" :project="wb.state.project" @saved="onEditSaved" />
  </div>
</template>
