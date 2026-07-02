<template>
  <div>
    <div class="sf-page-head">
      <div>
        <h1 class="sf-page-title">小说与事件</h1>
        <p class="sf-page-desc">导入小说章节，由 EventAgent 提取结构化事件。</p>
      </div>
      <n-button type="primary" @click="goImport">＋ 导入章节</n-button>
    </div>

    <PipelineSteps active-key="novel" />

    <n-spin :show="chaptersLoading">
    <div class="sf-grid sf-grid--2">
      <PanelCard title="章节" framed>
        <EmptyState v-if="!projectChapters.length" icon="📖" title="尚无章节" desc="该项目还没有导入任何小说章节。">
          <n-button type="primary" @click="goImport">＋ 导入章节</n-button>
        </EmptyState>
        <table v-else class="sf-table">
          <thead>
            <tr>
              <th>#</th>
              <th>标题</th>
              <th>字数</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="c in projectChapters"
              :key="c.id"
              :style="{ cursor: 'pointer', background: c.id === selectedChapter ? 'var(--sf-panel-2)' : '' }"
              @click="selectedChapter = c.id"
            >
              <td><strong>{{ c.chapterNo }}</strong></td>
              <td><strong>{{ c.title }}</strong></td>
              <td>{{ c.wordCount }}</td>
              <td><StatusBadge :status="toPipelineStatus(c.status)" /></td>
            </tr>
          </tbody>
        </table>

        <n-button
          class="sf-mt-16"
          type="primary"
          :loading="extracting"
          :disabled="!selectedChapter"
          @click="extract"
        >
          ✨ 提取事件
        </n-button>
      </PanelCard>

      <PanelCard :title="`已提取事件 · ${chapterEvents.length}`">
        <EmptyState v-if="!chapterEvents.length" icon="🔍" title="该章节暂无事件" desc="点击“提取事件”开始生成。" />
        <ol v-else style="margin: 0; padding-left: 18px; display: grid; gap: 12px">
          <li v-for="ev in chapterEvents" :key="ev.id">
            <div class="sf-mb-8">{{ ev.summary }}</div>
            <div class="sf-row sf-wrap">
              <span class="sf-tag">📍 {{ ev.location }}</span>
              <span v-for="ch in ev.characters" :key="ch" class="sf-tag">🎭 {{ ch }}</span>
            </div>
          </li>
        </ol>
      </PanelCard>
    </div>
    </n-spin>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { getProjectChapters, type NovelChapter } from '@/api/projects'
import { extractEvents, getChapterEvents, getEventExtractionStatus, type EventExtractionTask } from '@/api/events'
import type { NovelEvent } from '@/api/episodes'
import { getApiErrorMessage } from '@/api/client'
import { toPipelineStatus } from '@/utils/status'
import { useTaskPolling } from '@/composables/useTaskPolling'
import { useProject } from '@/composables/useProject'
import PipelineSteps from '@/components/PipelineSteps.vue'
import PanelCard from '@/components/PanelCard.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import EmptyState from '@/components/EmptyState.vue'

const message = useMessage()
const router = useRouter()
const { projectId } = useProject()

const projectChapters = ref<NovelChapter[]>([])
const chaptersLoading = ref(false)
const selectedChapter = ref('')
const chapterEvents = ref<NovelEvent[]>([])

function goImport() {
  void router.push({ name: 'novel-import', params: { id: projectId.value } })
}

async function loadChapters() {
  if (!projectId.value) return
  chaptersLoading.value = true
  try {
    projectChapters.value = await getProjectChapters(projectId.value)
    if (!selectedChapter.value) {
      selectedChapter.value = projectChapters.value[0]?.id ?? ''
    }
  } catch (error) {
    message.error(getApiErrorMessage(error))
  } finally {
    chaptersLoading.value = false
  }
}

async function loadChapterEvents() {
  if (!selectedChapter.value) {
    chapterEvents.value = []
    return
  }
  try {
    chapterEvents.value = await getChapterEvents(selectedChapter.value)
  } catch (error) {
    message.error(getApiErrorMessage(error))
  }
}

onMounted(loadChapters)
watch(projectId, loadChapters)
watch(selectedChapter, loadChapterEvents)

const { start: startPolling, isPolling: extracting } = useTaskPolling<EventExtractionTask>({
  fetchStatus: getEventExtractionStatus,
  isDone: (t) => t.status === 'completed',
  isFailed: (t) => t.status === 'failed',
  getErrorMessage: (t) => t.errorMessage,
  onDone: () => {
    message.success('事件提取完成')
    void loadChapterEvents()
  },
  onFailed: (t) => message.error(t.errorMessage ?? '事件提取失败'),
})

async function extract() {
  if (!selectedChapter.value) return
  try {
    const { taskId } = await extractEvents(projectId.value, selectedChapter.value)
    startPolling(taskId)
  } catch (error) {
    message.error(getApiErrorMessage(error))
  }
}
</script>