<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue'
import { WorkbenchKey } from '@/composables/workbenchKey'
import { useTaskCenter } from '@/store/taskCenter'
import { conflictLevelLabel, eventImportanceLabel, eventTypeLabel } from '@/utils/eventLabels'
import ImportChaptersDrawer from '@/components/workbench/ImportChaptersDrawer.vue'

const props = defineProps<{ inspectorCollapsed: boolean }>()
const chapterId = defineModel<string>('chapterId', { default: '' })
const eventId = defineModel<string>('eventId', { default: '' })

const wb = inject(WorkbenchKey)!
const taskCenter = useTaskCenter()
const importOpen = ref(false)

watch(
  () => wb.state.chapters,
  (chapters) => {
    if (!chapterId.value && chapters.length) chapterId.value = chapters[0].id
  },
  { immediate: true },
)

const selectedChapter = computed(
  () => wb.state.chapters.find((c) => c.id === chapterId.value) ?? wb.state.chapters[0] ?? null,
)
const paragraphs = computed(() =>
  (selectedChapter.value?.content ?? '').split(/\n+/).map((p) => p.trim()).filter(Boolean),
)
const events = computed(() => (selectedChapter.value ? wb.state.eventsByChapter.get(selectedChapter.value.id) ?? [] : []))
const selectedEvent = computed(() => events.value.find((e) => e.id === eventId.value) ?? events.value[0] ?? null)

const extractingChapterId = computed(
  () => wb.state.chapters.find((c) => taskCenter.isScopeBusy(c.id))?.id ?? null,
)
const otherChapterExtracting = computed(
  () => extractingChapterId.value !== null && extractingChapterId.value !== selectedChapter.value?.id,
)
const extractingElapsed = computed(() => {
  const task = taskCenter.tasks.value.find((t) => t.scope === selectedChapter.value?.id && t.kind === 'event_extraction')
  if (!task) return 0
  return Math.round((Date.now() - task.startedAt) / 1000)
})

function selectChapter(id: string) {
  chapterId.value = id
  eventId.value = ''
}

function selectEvent(id: string) {
  eventId.value = id
}

function extract() {
  if (!selectedChapter.value) return
  wb.actions.extractEvents(selectedChapter.value.id)
}
</script>

<template>
  <div :class="['wb-pane', { noinsp: props.inspectorCollapsed }]" data-screen-label="小说模式">
    <aside class="wb-tree">
      <div class="wb-thead">章节</div>
      <button
        v-for="c in wb.state.chapters"
        :key="c.id"
        :class="['wb-trow', { on: c.id === selectedChapter?.id }]"
        @click="selectChapter(c.id)"
      >
        {{ c.title ?? `第 ${c.chapterNo} 章` }}
        <span v-if="extractingChapterId === c.id" class="wb-spin" />
        <span class="wb-tick">{{ (wb.state.eventsByChapter.get(c.id)?.length ?? 0) > 0 ? '✓' : '' }}</span>
      </button>
      <div class="wb-treefoot">
        <button class="wb-linkbtn" @click="importOpen = true">+ 导入章节</button>
      </div>
    </aside>

    <div class="wb-canvas ohide">
      <div class="wb-novelcv">
        <div class="wb-prose">
          <div class="wb-prosein">
            <h2 class="wb-ptitle">{{ selectedChapter?.title ?? (selectedChapter ? `第 ${selectedChapter.chapterNo} 章` : '') }}</h2>
            <p v-for="(p, i) in paragraphs" :key="i" class="wb-para">{{ p }}</p>
          </div>
        </div>

        <div class="wb-evcol">
          <template v-if="events.length > 0">
            <div class="wb-thead" style="padding-left: 2px">事件 · {{ events.length }}</div>
            <button
              v-for="(e, i) in events"
              :key="e.id"
              :class="['wb-ecard', { on: e.id === selectedEvent?.id }]"
              @click="selectEvent(e.id)"
            >
              <span class="wb-enum">事件 {{ String(i + 1).padStart(2, '0') }}</span>
              <span class="wb-etitle">{{ e.summary }}</span>
              <span class="wb-emeta">{{ eventTypeLabel(e.eventType) }} · 重要度 {{ eventImportanceLabel(e.importance) }} · {{ e.location }}</span>
            </button>
          </template>

          <div v-else-if="extractingChapterId === selectedChapter?.id" class="wb-empty">
            <span class="wb-spin" style="margin: 0; width: 18px; height: 18px" />
            <span class="wb-emptyti">正在提取本章事件…</span>
            <span>已用时 {{ extractingElapsed }} 秒 · 可在任务中心查看</span>
          </div>

          <div v-else class="wb-empty">
            <span class="wb-emptyti">本章尚未提取事件</span>
            <button class="wb-btn pri" :disabled="otherChapterExtracting" @click="extract">✨ 提取事件</button>
            <span v-if="otherChapterExtracting" style="font-size: 11.5px">
              「{{ wb.state.chapters.find((c) => c.id === extractingChapterId)?.title }}」提取进行中，完成后可提取本章
            </span>
          </div>
        </div>
      </div>
    </div>

    <aside v-if="!props.inspectorCollapsed" class="wb-insp">
      <template v-if="selectedEvent">
        <p class="wb-ihead">事件 {{ String(events.findIndex((e) => e.id === selectedEvent!.id) + 1).padStart(2, '0') }}</p>
        <p class="wb-ititle">{{ selectedEvent.summary }}</p>
        <div class="wb-frow"><span class="wb-flabel">类型</span><span class="wb-fval"><span class="wb-chip">{{ eventTypeLabel(selectedEvent.eventType) }}</span></span></div>
        <div class="wb-frow"><span class="wb-flabel">重要度</span><span class="wb-fval">{{ eventImportanceLabel(selectedEvent.importance) }}</span></div>
        <div class="wb-frow"><span class="wb-flabel">冲突等级</span><span class="wb-fval">{{ conflictLevelLabel(selectedEvent.conflictLevel) }}</span></div>
        <div class="wb-frow"><span class="wb-flabel">情绪</span><span class="wb-fval">{{ selectedEvent.emotionTone }}</span></div>
        <div class="wb-frow"><span class="wb-flabel">地点</span><span class="wb-fval">{{ selectedEvent.location }}</span></div>
        <div class="wb-frow"><span class="wb-flabel">人物</span><span class="wb-fval">{{ selectedEvent.characters.join('、') }}</span></div>
        <div class="wb-sec">摘要</div>
        <p class="wb-fval wb-fs13 wb-m0" style="line-height: 1.7">{{ selectedEvent.detail }}</p>
      </template>
      <p v-else class="wb-notchosen">在画布中选择一个事件，这里会显示它的属性</p>
    </aside>

    <ImportChaptersDrawer v-if="importOpen" @close="importOpen = false" />
  </div>
</template>
