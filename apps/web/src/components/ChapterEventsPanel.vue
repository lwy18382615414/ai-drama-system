<script setup lang="ts">
import { computed, toRef } from 'vue'
import { NSpin } from 'naive-ui'
import { useChapterEventsQuery } from '@/composables/useEvents'

// 单章事件面板：展开某章时挂载，读取 GET /agents/event/result/:chapterId。
const props = defineProps<{ chapterId: string }>()

const { data: events, isPending, isError, error } = useChapterEventsQuery(toRef(props, 'chapterId'))

const importanceLabel: Record<string, string> = {
  minor: '次要',
  normal: '一般',
  major: '重要',
  critical: '关键',
}

function parseCharacters(charactersJson: string): string[] {
  try {
    const parsed = JSON.parse(charactersJson)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

const hasEvents = computed(() => (events.value?.length ?? 0) > 0)
</script>

<template>
  <div class="events-panel">
    <div v-if="isPending" class="panel-state">
      <NSpin size="small" />
      <span>加载事件…</span>
    </div>
    <div v-else-if="isError" class="panel-state panel-state--error">
      事件加载失败：{{ error?.message ?? '请稍后重试' }}
    </div>
    <div v-else-if="!hasEvents" class="panel-state">该章尚无已抽取的事件。</div>
    <ol v-else class="event-list">
      <li v-for="ev in events" :key="ev.id" class="event-item">
        <div class="event-head">
          <span class="event-no">#{{ ev.eventNo }}</span>
          <span class="event-type">{{ ev.eventType }}</span>
          <span class="event-importance" :class="`imp--${ev.importance}`">
            {{ importanceLabel[ev.importance] ?? ev.importance }}
          </span>
          <span v-if="ev.location" class="event-loc">📍 {{ ev.location }}</span>
        </div>
        <div class="event-summary">{{ ev.summary }}</div>
        <div v-if="parseCharacters(ev.charactersJson).length" class="event-chars">
          <span
            v-for="name in parseCharacters(ev.charactersJson)"
            :key="name"
            class="char-chip"
          >
            {{ name }}
          </span>
        </div>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.events-panel {
  padding: 0;
}
.panel-state {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #8a9099;
  padding: 16px 8px;
  justify-content: center;
}
.panel-state--error {
  color: #d03050;
}
.event-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.event-item {
  background: #fafbfc;
  border: 1px solid #edf0f2;
  border-radius: 8px;
  padding: 8px 12px;
}
.event-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  flex-wrap: wrap;
}
.event-no {
  color: #a0a6ad;
  font-variant-numeric: tabular-nums;
}
.event-type {
  background: #e7f5ee;
  color: #18a058;
  border-radius: 4px;
  padding: 1px 8px;
  font-weight: 500;
}
.event-importance {
  border-radius: 4px;
  padding: 1px 8px;
  color: #5b6169;
  background: #f0f2f5;
}
.event-importance.imp--major,
.event-importance.imp--critical {
  color: #d97a00;
  background: #fdf3e6;
}
.event-loc {
  color: #8a9099;
}
.event-summary {
  font-size: 13px;
  color: #2b2f33;
  margin-top: 6px;
  line-height: 1.5;
}
.event-chars {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.char-chip {
  font-size: 11px;
  color: #5b6169;
  background: #f0f2f5;
  border-radius: 10px;
  padding: 1px 9px;
}
</style>
