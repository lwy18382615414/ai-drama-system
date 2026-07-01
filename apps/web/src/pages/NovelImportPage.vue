<script setup lang="ts">
import { computed, ref } from 'vue'
import { chapters, events } from '@/mock'
import { useProject } from '@/composables/useProject'
import PipelineSteps from '@/components/PipelineSteps.vue'
import PanelCard from '@/components/PanelCard.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import MockButton from '@/components/MockButton.vue'
import EmptyState from '@/components/EmptyState.vue'

const { projectId } = useProject()
const projectChapters = computed(() => chapters.filter((c) => c.projectId === projectId.value))

const selectedChapter = ref(projectChapters.value[0]?.id ?? '')
const chapterEvents = computed(() => events.filter((e) => e.chapterId === selectedChapter.value))
const draft = ref('')
</script>

<template>
  <div>
    <div class="sf-page-head">
      <div>
        <h1 class="sf-page-title">小说与事件</h1>
        <p class="sf-page-desc">导入小说章节，由 EventAgent 提取结构化事件（演示数据）。</p>
      </div>
      <MockButton label="导入章节" variant="primary" icon="⬆️" />
    </div>

    <PipelineSteps active-key="events" />

    <div class="sf-grid sf-grid--2">
      <PanelCard title="章节">
        <table class="sf-table">
          <thead>
            <tr>
              <th>#</th>
              <th>标题</th>
              <th>字数</th>
              <th>事件</th>
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
              <td>{{ c.eventCount }}</td>
              <td><StatusBadge :status="c.status" /></td>
            </tr>
          </tbody>
        </table>

        <div class="sf-field sf-mt-16">
          <label class="sf-label">粘贴新章节正文</label>
          <textarea v-model="draft" class="sf-textarea" placeholder="在此粘贴小说章节文本…（演示，未接后端）" />
        </div>
        <MockButton label="提取事件" variant="primary" icon="✨" />
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
  </div>
</template>
