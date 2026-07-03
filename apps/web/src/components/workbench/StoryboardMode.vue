<script setup lang="ts">
import { computed, inject, watch } from 'vue'
import { WorkbenchKey } from '@/composables/workbenchKey'
import { useTaskCenter } from '@/store/taskCenter'

const props = defineProps<{ inspectorCollapsed: boolean }>()
const episodeId = defineModel<string>('episodeId', { default: '' })
const shotId = defineModel<string>('shotId', { default: '' })

const emit = defineEmits<{ jumpToCharacter: [characterId: string] }>()

const wb = inject(WorkbenchKey)!
const taskCenter = useTaskCenter()

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
const shots = computed(() => (selectedEpisode.value ? wb.state.storyboardsByEpisode.get(selectedEpisode.value.id) ?? [] : []))
const selectedShot = computed(() => shots.value.find((s) => s.id === shotId.value) ?? shots.value[0] ?? null)

const generatingBoard = computed(() => !!selectedEpisode.value && taskCenter.isTaskBusy(selectedEpisode.value.id, 'storyboard_generation'))
const batching = computed(() => !!selectedEpisode.value && wb.batchGeneratingEpisodes.has(selectedEpisode.value.id))

function shotState(shotStatus: { firstFrameImageUrl: string | null; id: string }) {
  if (shotStatus.firstFrameImageUrl) return 'done'
  if (taskCenter.isTaskBusy(shotStatus.id, 'image_generation')) return 'gen'
  return 'none'
}

const summary = computed(() => {
  const done = shots.value.filter((s) => s.firstFrameImageUrl).length
  const gen = shots.value.filter((s) => shotState(s) === 'gen').length
  const none = shots.value.length - done - gen
  return `${shots.value.length} 个镜头 · ${done} 已出图 · ${gen} 生成中 · ${none} 待出图`
})

function sceneName(sceneId: string | null) {
  if (!sceneId) return '—'
  return wb.state.scenes.find((s) => s.id === sceneId)?.name ?? sceneId
}

function characterNames(ids: string[]) {
  if (!ids.length) return '—'
  return ids.map((id) => wb.state.characters.find((c) => c.id === id)?.name ?? id).join('、')
}

function selectEpisode(id: string) {
  episodeId.value = id
  shotId.value = ''
}

function selectShot(id: string) {
  shotId.value = id
}

function regenerateBoard() {
  if (selectedEpisode.value) wb.actions.generateStoryboards(selectedEpisode.value.id, { force: true })
}

function batchGenerate() {
  if (selectedEpisode.value) wb.actions.batchGenerateFirstFrames(selectedEpisode.value.id)
}

function regenerateShot() {
  if (selectedShot.value && selectedEpisode.value) {
    wb.actions.generateStoryboardFirstFrame(selectedShot.value.id, selectedEpisode.value.id, { force: true })
  }
}

function jumpToChar() {
  const id = selectedShot.value?.characterIds[0]
  if (id) emit('jumpToCharacter', id)
}
</script>

<template>
  <div :class="['wb-pane', { noinsp: props.inspectorCollapsed }]" data-screen-label="分镜模式">
    <aside class="wb-tree">
      <div class="wb-thead">剧集</div>
      <button
        v-for="e in wb.state.episodes"
        :key="e.id"
        :class="['wb-trow', { on: e.id === selectedEpisode?.id }]"
        @click="selectEpisode(e.id)"
      >
        第 {{ e.episodeNo }} 集
        <span v-if="taskCenter.isTaskBusy(e.id, 'storyboard_generation')" class="wb-spin" />
        <span class="wb-tick">{{ (wb.state.storyboardsByEpisode.get(e.id)?.length ?? 0) > 0 ? '✓' : '' }}</span>
      </button>
    </aside>

    <div class="wb-canvas">
      <template v-if="shots.length > 0">
        <div class="wb-shotgrid">
          <button
            v-for="(s, i) in shots"
            :key="s.id"
            :class="['wb-shot', { on: s.id === selectedShot?.id }]"
            @click="selectShot(s.id)"
          >
            <div v-if="shotState(s) === 'done'" class="wb-thumbbox wb-ph wb-mono">SHOT {{ String(i + 1).padStart(2, '0') }} · 首帧图</div>
            <div v-else-if="shotState(s) === 'gen'" class="wb-thumbbox gen"><span class="wb-spin" />生成中</div>
            <div v-else class="wb-thumbbox none">待出图</div>
            <div class="wb-shotft">
              <span class="wb-shotno wb-mono">{{ String(i + 1).padStart(2, '0') }}</span>
              <span>{{ s.shotType }}</span>
              <span style="margin-left: auto">{{ shotState(s) === 'done' ? '✓' : shotState(s) === 'gen' ? '●' : '' }}</span>
            </div>
          </button>
        </div>
        <div class="wb-boardft">
          <span>{{ summary }}</span>
          <button class="wb-btn" style="margin-left: auto" :disabled="generatingBoard" @click="regenerateBoard">🔁 重新生成分镜</button>
          <button class="wb-btn pri" :disabled="batching" @click="batchGenerate">{{ batching ? '生成中…' : '🎨 批量生成缺图' }}</button>
        </div>
      </template>

      <div v-else class="wb-empty">
        <span class="wb-emptyti">{{ selectedEpisode ? `第 ${selectedEpisode.episodeNo} 集` : '' }} 尚无分镜</span>
        <span style="max-width: 340px; line-height: 1.7">需先生成本集剧本，再由剧本拆解分镜</span>
        <button class="wb-btn pri" :disabled="!selectedEpisode?.scriptId || generatingBoard" @click="regenerateBoard">
          {{ generatingBoard ? '生成中…' : '生成分镜' }}
        </button>
      </div>
    </div>

    <aside v-if="!props.inspectorCollapsed" class="wb-insp">
      <template v-if="selectedShot">
        <p class="wb-ihead">镜头 {{ String(shots.findIndex((s) => s.id === selectedShot!.id) + 1).padStart(2, '0') }}</p>
        <p class="wb-ititle">{{ selectedShot.action }}</p>
        <div class="wb-fx wb-gap8 wb-mt8"><span class="wb-chip">{{ selectedShot.shotType }}</span><span v-if="selectedShot.cameraMovement" class="wb-chip">{{ selectedShot.cameraMovement }}</span></div>
        <div class="wb-frow wb-mt12"><span class="wb-flabel">关联场景</span><span class="wb-fval">{{ sceneName(selectedShot.sceneId) }}</span></div>
        <div class="wb-frow">
          <span class="wb-flabel">关联角色</span>
          <span class="wb-fval">
            <button class="wb-linkbtn" style="width: auto; padding: 0; color: #3247b8" :disabled="!selectedShot.characterIds.length" @click="jumpToChar">
              {{ characterNames(selectedShot.characterIds) }} ↗
            </button>
          </span>
        </div>
        <div class="wb-frow">
          <span class="wb-flabel">状态</span>
          <span class="wb-fval"><span :class="shotState(selectedShot) === 'done' ? 'wb-chip ok' : shotState(selectedShot) === 'gen' ? 'wb-chip run' : 'wb-chip'">{{ shotState(selectedShot) === 'done' ? '已出图' : shotState(selectedShot) === 'gen' ? '生成中' : '待出图' }}</span></span>
        </div>
        <div class="wb-sec">image_prompt</div>
        <div class="wb-pblock wb-mono">{{ selectedShot.imagePrompt }}</div>
        <div class="wb-sec">操作</div>
        <button class="wb-btn blk" :disabled="shotState(selectedShot) === 'gen'" @click="regenerateShot">🎨 重新生成本镜图</button>
      </template>
      <p v-else class="wb-notchosen">生成分镜后，选中镜头查看属性</p>
    </aside>
  </div>
</template>
