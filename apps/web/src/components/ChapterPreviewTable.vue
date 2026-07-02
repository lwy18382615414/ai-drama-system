<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { SplitChapterPreview } from '@/api/projects'

export interface PreviewRow extends SplitChapterPreview {
  include: boolean
  editableTitle: string
}

const props = defineProps<{ rows: PreviewRow[] }>()

const selectedIndex = ref(0)
const includedCount = computed(() => props.rows.filter((row) => row.include).length)
const selectedRow = computed(() => props.rows[selectedIndex.value] ?? null)

defineExpose({ includedCount })

watch(
  () => props.rows.length,
  (length) => {
    if (length === 0) {
      selectedIndex.value = 0
      return
    }

    if (selectedIndex.value > length - 1) {
      selectedIndex.value = 0
    }
  },
  { immediate: true },
)

function selectChapter(index: number) {
  selectedIndex.value = index
}

function chapterTitle(row: PreviewRow, index: number) {
  return row.editableTitle.trim() || row.title || `第 ${index + 1} 章`
}
</script>

<template>
  <div class="chapter-preview">
    <div class="chapter-preview__summary">
      <div>
        <strong>共切分出 {{ rows.length }} 章</strong>
        <span class="sf-muted">，已勾选 {{ includedCount }} 章</span>
      </div>
      <span class="sf-faint">可修改标题或取消勾选不需要的章节</span>
    </div>

    <div v-if="rows.length" class="chapter-browser">
      <aside class="chapter-browser__side" aria-label="章节列表">
        <div class="chapter-list">
          <div
            v-for="(row, index) in rows"
            :key="index"
            class="chapter-list__item"
            :class="{ 'is-active': index === selectedIndex, 'is-excluded': !row.include }"
            role="button"
            tabindex="0"
            @click="selectChapter(index)"
            @keydown.enter.prevent="selectChapter(index)"
            @keydown.space.prevent="selectChapter(index)"
          >
            <div class="chapter-list__meta">
              <n-checkbox v-model:checked="row.include" @click.stop />
              <span class="chapter-list__no">#{{ index + 1 }}</span>
              <span class="chapter-list__count">{{ row.wordCount }} 字</span>
            </div>
            <n-input
              v-model:value="row.editableTitle"
              size="small"
              placeholder="（未识别标题）"
              @click.stop
              @keydown.stop
            />
          </div>
        </div>
      </aside>

      <section class="chapter-browser__content" aria-label="章节正文">
        <header class="chapter-reader__head">
          <div>
            <div class="chapter-reader__eyebrow">第 {{ selectedIndex + 1 }} 章 · {{ selectedRow?.wordCount ?? 0 }} 字</div>
            <h3 class="chapter-reader__title">
              {{ selectedRow ? chapterTitle(selectedRow, selectedIndex) : '未选择章节' }}
            </h3>
          </div>
          <span
            class="chapter-reader__status"
            :class="{ 'is-included': selectedRow?.include, 'is-excluded': selectedRow && !selectedRow.include }"
          >
            {{ selectedRow?.include ? '将导入' : '已排除' }}
          </span>
        </header>
        <article class="chapter-reader__body">
          {{ selectedRow?.content }}
        </article>
      </section>
    </div>

    <p v-else class="sf-muted">暂无可确认的章节。</p>
  </div>
</template>

<style scoped>
.chapter-preview {
  display: grid;
  gap: 12px;
}

.chapter-preview__summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
}

.chapter-browser {
  display: grid;
  grid-template-columns: minmax(300px, 36%) minmax(0, 1fr);
  height: clamp(540px, 68vh, 760px);
  border: 1px solid var(--sf-border-soft);
  border-radius: var(--sf-radius-sm);
  background: var(--sf-panel);
  overflow: hidden;
}

.chapter-browser__side {
  min-width: 0;
  min-height: 0;
  border-right: 1px solid var(--sf-border-soft);
  background: var(--sf-panel-2);
  overflow-y: auto;
}

.chapter-list {
  display: grid;
  gap: 8px;
  padding: 10px;
}

.chapter-list__item {
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid transparent;
  border-radius: var(--sf-radius-sm);
  background: var(--sf-panel);
  cursor: pointer;
  transition:
    border-color 0.14s,
    box-shadow 0.14s,
    opacity 0.14s;
}

.chapter-list__item:hover,
.chapter-list__item:focus-visible {
  border-color: rgba(47, 85, 212, 0.38);
  box-shadow: var(--sf-shadow-sm);
  outline: none;
}

.chapter-list__item.is-active {
  border-color: var(--sf-primary);
  box-shadow: 0 0 0 2px var(--sf-primary-soft);
}

.chapter-list__item.is-excluded {
  opacity: 0.62;
}

.chapter-list__meta {
  display: grid;
  grid-template-columns: auto auto 1fr;
  align-items: center;
  gap: 8px;
  color: var(--sf-text-dim);
  font-size: 12px;
}

.chapter-list__no {
  color: var(--sf-text);
  font-weight: 700;
}

.chapter-list__count {
  justify-self: end;
  color: var(--sf-text-faint);
}

.chapter-browser__content {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  background: var(--sf-bg-elev);
}

.chapter-reader__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px;
  border-bottom: 1px solid var(--sf-border-soft);
}

.chapter-reader__eyebrow {
  margin-bottom: 4px;
  color: var(--sf-text-faint);
  font-size: 12px;
}

.chapter-reader__title {
  margin: 0;
  color: var(--sf-text);
  font-size: 18px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.chapter-reader__status {
  flex: 0 0 auto;
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid var(--sf-border);
  color: var(--sf-text-faint);
  font-size: 12px;
  font-weight: 650;
}

.chapter-reader__status.is-included {
  border-color: rgba(22, 163, 74, 0.35);
  color: var(--sf-success);
  background: rgba(22, 163, 74, 0.08);
}

.chapter-reader__status.is-excluded {
  border-color: rgba(220, 38, 38, 0.25);
  color: var(--sf-danger);
  background: rgba(220, 38, 38, 0.06);
}

.chapter-reader__body {
  min-height: 0;
  margin: 0;
  padding: 22px 24px 28px;
  overflow-y: auto;
  color: var(--sf-text);
  font-size: 14.5px;
  line-height: 1.9;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

@media (max-width: 900px) {
  .chapter-preview__summary {
    align-items: flex-start;
    flex-direction: column;
    gap: 4px;
  }

  .chapter-browser {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(220px, 38vh) minmax(360px, 1fr);
    height: auto;
  }

  .chapter-browser__side {
    border-right: none;
    border-bottom: 1px solid var(--sf-border-soft);
  }

  .chapter-reader__body {
    max-height: 62vh;
  }
}
</style>
