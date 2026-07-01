<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { getEpisode, script } from '@/mock'
import { useProject } from '@/composables/useProject'
import PipelineSteps from '@/components/PipelineSteps.vue'
import PanelCard from '@/components/PanelCard.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import MockButton from '@/components/MockButton.vue'

useProject()
const route = useRoute()
const episode = computed(() => getEpisode(route.params.episodeId as string))
// Local editable copy of the mock script content — no persistence.
const draft = ref(script.content)
</script>

<template>
  <div>
    <div class="sf-page-head">
      <div>
        <h1 class="sf-page-title">剧本编辑</h1>
        <p class="sf-page-desc">
          {{ episode ? `第 ${episode.episodeNo} 集 · ${episode.title}` : '剧集' }} · 版本 v{{ script.version }}
        </p>
      </div>
      <div class="sf-row">
        <StatusBadge :status="script.status" />
        <MockButton label="重新生成" icon="🔁" />
        <MockButton label="保存" variant="primary" icon="💾" />
      </div>
    </div>

    <PipelineSteps active-key="script" />

    <PanelCard title="剧本正文">
      <template #actions>
        <span class="sf-faint">演示 · 编辑不会保存到后端</span>
      </template>
      <textarea v-model="draft" class="sf-textarea" style="min-height: 460px" spellcheck="false" />
    </PanelCard>
  </div>
</template>
