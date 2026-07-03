<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue'
import { WorkbenchKey } from '@/composables/workbenchKey'
import { useTaskCenter } from '@/store/taskCenter'
import { getApiErrorMessage } from '@/api/client'

const props = defineProps<{ inspectorCollapsed: boolean }>()
const episodeId = defineModel<string>('episodeId', { default: '' })

const wb = inject(WorkbenchKey)!
const taskCenter = useTaskCenter()
const dialog = useDialog()
const message = useMessage()
const draft = ref('')
const saving = ref(false)

watch(
  () => wb.state.episodes,
  (episodes) => {
    if (!episodeId.value && episodes.length) episodeId.value = episodes[0].id
  },
  { immediate: true },
)

const selectedEpisode = computed(
  () => wb.state.episodes.find((e) => e.id === episodeId.value) ?? wb.state.episodes[0] ?? null,
)
const script = computed(() => (selectedEpisode.value ? wb.state.scriptsByEpisode.get(selectedEpisode.value.id) ?? null : null))
const sourceEvents = computed(() => (selectedEpisode.value ? wb.state.sourceEventsByEpisode.get(selectedEpisode.value.id) ?? null : null))
const assets = computed(() => (selectedEpisode.value ? wb.state.assetsByEpisode.get(selectedEpisode.value.id) ?? null : null))
const hasAssets = computed(() => !!assets.value && (assets.value.characters.length > 0 || assets.value.scenes.length > 0 || assets.value.props.length > 0))

watch(
  selectedEpisode,
  (ep) => {
    if (ep?.scriptId) {
      wb.loadScriptFor(ep.id)
      wb.loadSourceEventsFor(ep.id)
    }
  },
  { immediate: true },
)

watch(script, (s) => { draft.value = s?.content ?? '' })

const generating = computed(() => !!selectedEpisode.value && taskCenter.isTaskBusy(selectedEpisode.value.id, 'script_generation'))
const extracting = computed(() => !!selectedEpisode.value && taskCenter.isTaskBusy(selectedEpisode.value.id, 'asset_extraction'))
const canPlan = computed(() => Array.from(wb.state.eventsByChapter.values()).some((evs) => evs.length > 0))

function selectEpisode(id: string) {
  episodeId.value = id
}

function replan() {
  const hasExisting = wb.state.episodes.length > 0
  if (!hasExisting) {
    wb.actions.planEpisodes()
    return
  }
  dialog.warning({
    title: '重新规划剧集',
    content: '将根据当前事件重新规划剧集分组，已有剧集的剧本/分镜等衍生内容不会被自动清理，请谨慎操作。',
    positiveText: '重新规划',
    negativeText: '取消',
    onPositiveClick: () => wb.actions.planEpisodes(),
  })
}

function generateScript() {
  if (selectedEpisode.value) wb.actions.generateScript(selectedEpisode.value.id)
}

function regenerateScript() {
  if (selectedEpisode.value) wb.actions.generateScript(selectedEpisode.value.id, { force: true })
}

async function save() {
  if (!script.value) return
  saving.value = true
  try {
    await wb.saveScript(script.value.id, draft.value)
    message.success('已保存')
  } catch (error) {
    message.error(getApiErrorMessage(error))
  } finally {
    saving.value = false
  }
}

function extractAssets() {
  if (selectedEpisode.value) wb.actions.extractAssets(selectedEpisode.value.id)
}

function reextractAssets() {
  if (selectedEpisode.value) wb.actions.extractAssets(selectedEpisode.value.id, { force: true })
}
</script>

<template>
  <div :class="['wb-pane', { noinsp: props.inspectorCollapsed }]" data-screen-label="剧本模式">
    <aside class="wb-tree">
      <div class="wb-thead">剧集</div>
      <button
        v-for="e in wb.state.episodes"
        :key="e.id"
        :class="['wb-trow', { on: e.id === selectedEpisode?.id }]"
        @click="selectEpisode(e.id)"
      >
        第 {{ e.episodeNo }} 集
        <span class="wb-tick">{{ e.scriptId ? '✓' : '' }}</span>
      </button>
      <div class="wb-treefoot">
        <button class="wb-linkbtn" :disabled="!canPlan" @click="replan">⟳ 重新规划剧集</button>
      </div>
    </aside>

    <div class="wb-canvas">
      <div v-if="wb.state.episodes.length === 0" class="wb-empty">
        <span class="wb-emptyti">尚未规划剧集</span>
        <span style="max-width: 340px; line-height: 1.7">EpisodePlannerAgent 会将已提取的事件分组为短剧剧集</span>
        <button class="wb-btn pri" :disabled="!canPlan" @click="replan">AI 规划剧集</button>
        <span v-if="!canPlan" style="font-size: 11.5px">请先在小说模式提取事件</span>
      </div>

      <div v-else-if="selectedEpisode?.scriptId" class="wb-scriptwrap">
        <div class="wb-scripthd">
          <button class="wb-btn" :disabled="generating" @click="regenerateScript">🔁 重新生成</button>
          <button class="wb-btn pri" :disabled="saving || !script" @click="save">💾 {{ saving ? '保存中…' : '保存' }}</button>
        </div>
        <textarea v-if="script" v-model="draft" class="wb-script editable" rows="20" spellcheck="false" />
        <div v-else class="wb-script">加载中…</div>
      </div>

      <div v-else class="wb-empty">
        <span class="wb-emptyti">{{ selectedEpisode ? `第 ${selectedEpisode.episodeNo} 集` : '' }} 尚无剧本</span>
        <span style="max-width: 340px; line-height: 1.7">将基于本集关联的来源事件生成初稿，生成后可在此编辑</span>
        <button class="wb-btn pri" :disabled="generating" @click="generateScript">{{ generating ? '生成中…' : '✨ 生成剧本' }}</button>
      </div>
    </div>

    <aside v-if="!props.inspectorCollapsed" class="wb-insp">
      <template v-if="selectedEpisode">
        <p class="wb-ihead">本集信息</p>
        <p class="wb-ititle">第 {{ selectedEpisode.episodeNo }} 集 · {{ selectedEpisode.title }}</p>
        <div class="wb-frow">
          <span class="wb-flabel">状态</span>
          <span class="wb-fval"><span :class="selectedEpisode.scriptId ? 'wb-chip ok' : 'wb-chip'">{{ selectedEpisode.scriptId ? '剧本已生成' : '尚无剧本' }}</span></span>
        </div>
        <div class="wb-frow"><span class="wb-flabel">梗概</span><span class="wb-fval">{{ selectedEpisode.summary }}</span></div>

        <div class="wb-sec">来源事件链</div>
        <div v-if="sourceEvents && sourceEvents.length" class="wb-col wb-gap8">
          <div v-for="s in sourceEvents" :key="s.linkId" class="wb-pblock wb-fs12">{{ s.event.summary }}</div>
        </div>
        <p v-else class="wb-notchosen wb-m0" style="text-align: left; padding: 4px 0">生成剧本后关联的事件会显示在这里</p>

        <div class="wb-sec">资产</div>
        <div v-if="hasAssets" class="wb-fx wb-ac wb-gap8">
          <span class="wb-chip ok">已提取 ✓</span>
          <button class="wb-btn" style="margin-left: auto" :disabled="extracting" @click="reextractAssets">🧩 重新提取</button>
        </div>
        <button v-else class="wb-btn blk" :disabled="!selectedEpisode.scriptId || extracting" @click="extractAssets">
          🧩 {{ extracting ? '提取中…' : '提取角色/场景/道具' }}
        </button>
      </template>
      <p v-else class="wb-notchosen">规划剧集后，选中一集查看属性</p>
    </aside>
  </div>
</template>
