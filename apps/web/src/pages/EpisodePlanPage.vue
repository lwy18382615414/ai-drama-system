<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { episodes } from '@/mock'
import { useProject } from '@/composables/useProject'
import PipelineSteps from '@/components/PipelineSteps.vue'
import PanelCard from '@/components/PanelCard.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import MockButton from '@/components/MockButton.vue'

const { projectId } = useProject()
const projectEpisodes = computed(() => episodes.filter((e) => e.projectId === projectId.value))
</script>

<template>
  <div>
    <div class="sf-page-head">
      <div>
        <h1 class="sf-page-title">剧集规划</h1>
        <p class="sf-page-desc">EpisodePlannerAgent 将小说事件分组为短剧剧集（演示数据）。</p>
      </div>
      <MockButton label="重新规划剧集" variant="primary" icon="🔁" />
    </div>

    <PipelineSteps active-key="episodes" />

    <div class="sf-grid sf-grid--2">
      <PanelCard v-for="ep in projectEpisodes" :key="ep.id" :title="`第 ${ep.episodeNo} 集 · ${ep.title}`">
        <template #actions>
          <StatusBadge :status="ep.status" />
        </template>

        <p class="sf-muted">{{ ep.synopsis }}</p>
        <div class="sf-row sf-wrap sf-mt-8">
          <span class="sf-tag">🔗 {{ ep.linkedEventCount }} 个源事件</span>
          <span class="sf-tag">{{ ep.hasScript ? '📝 已生成剧本' : '📝 待生成剧本' }}</span>
          <span class="sf-tag">🎞️ {{ ep.storyboardCount }} 分镜</span>
        </div>

        <div class="sf-row sf-mt-16 sf-gap-16">
          <RouterLink :to="{ name: 'script', params: { id: projectId, episodeId: ep.id } }">
            <MockButton label="剧本" size="sm" icon="📝" />
          </RouterLink>
          <RouterLink :to="{ name: 'storyboards', params: { id: projectId, episodeId: ep.id } }">
            <MockButton label="分镜" size="sm" icon="🎞️" />
          </RouterLink>
        </div>
      </PanelCard>
    </div>
  </div>
</template>
