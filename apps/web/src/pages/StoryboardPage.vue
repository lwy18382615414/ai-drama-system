<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { getEpisode, storyboards } from '@/mock'
import { useProject } from '@/composables/useProject'
import PipelineSteps from '@/components/PipelineSteps.vue'
import PanelCard from '@/components/PanelCard.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import MockButton from '@/components/MockButton.vue'
import EmptyState from '@/components/EmptyState.vue'

useProject()
const route = useRoute()
const episodeId = computed(() => route.params.episodeId as string)
const episode = computed(() => getEpisode(episodeId.value))
const shots = computed(() => storyboards.filter((s) => s.episodeId === episodeId.value))
</script>

<template>
  <div>
    <div class="sf-page-head">
      <div>
        <h1 class="sf-page-title">分镜工作台</h1>
        <p class="sf-page-desc">
          {{ episode ? `第 ${episode.episodeNo} 集 · ${episode.title}` : '剧集' }} · 逐镜头分镜与提示词（演示数据）
        </p>
      </div>
      <MockButton label="重新生成分镜" variant="primary" icon="🔁" />
    </div>

    <PipelineSteps active-key="storyboard" />

    <EmptyState v-if="!shots.length" icon="🎞️" title="该集暂无分镜" desc="生成剧本并提取资产后即可生成分镜。" />

    <div v-else class="sf-grid" style="gap: 16px">
      <PanelCard v-for="shot in shots" :key="shot.id" :title="`镜头 ${shot.shotNo} · ${shot.camera}`">
        <template #actions><StatusBadge :status="shot.status" /></template>

        <div class="sf-row" style="gap: 16px; align-items: flex-start">
          <div class="sf-thumb sf-thumb--wide" style="width: 200px; flex-shrink: 0">
            <span v-if="shot.status === 'done'">🖼️ 首帧</span>
            <span v-else>待生成</span>
          </div>

          <div style="min-width: 0; flex: 1">
            <p class="sf-mb-8">{{ shot.description }}</p>
            <div class="sf-row sf-wrap sf-mb-16">
              <span class="sf-tag">🏞️ {{ shot.scene }}</span>
              <span v-for="c in shot.characters" :key="c" class="sf-tag">🎭 {{ c }}</span>
            </div>

            <div class="sf-field">
              <div class="sf-label">image_prompt（规划字段）</div>
              <div class="sf-mono sf-muted sf-notice">{{ shot.image_prompt }}</div>
            </div>
            <div class="sf-field">
              <div class="sf-label">video_prompt（规划字段 · 未激活）</div>
              <div class="sf-mono sf-faint sf-notice" style="background: var(--sf-panel-2); border-color: var(--sf-border); color: var(--sf-text-dim)">
                {{ shot.video_prompt }}
              </div>
            </div>
          </div>
        </div>
      </PanelCard>
    </div>
  </div>
</template>
