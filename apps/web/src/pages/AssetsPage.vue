<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { characters, props as allProps, scenes } from '@/mock'
import { useProject } from '@/composables/useProject'
import PipelineSteps from '@/components/PipelineSteps.vue'
import PanelCard from '@/components/PanelCard.vue'
import MockButton from '@/components/MockButton.vue'

const { projectId } = useProject()

const tab = ref<'characters' | 'scenes' | 'props'>('characters')

const projectCharacters = computed(() => characters.filter((c) => c.projectId === projectId.value))
const projectScenes = computed(() => scenes.filter((s) => s.projectId === projectId.value))
const projectProps = computed(() => allProps.filter((p) => p.projectId === projectId.value))
</script>

<template>
  <div>
    <div class="sf-page-head">
      <div>
        <h1 class="sf-page-title">角色 / 场景 / 道具</h1>
        <p class="sf-page-desc">ExtractAgent 从剧本中提取的可复用生产资产（演示数据）。</p>
      </div>
      <MockButton label="重新提取资产" variant="primary" icon="🔁" />
    </div>

    <PipelineSteps active-key="assets" />

    <div class="sf-tabs">
      <div class="sf-tab" :class="{ 'is-active': tab === 'characters' }" @click="tab = 'characters'">
        角色 · {{ projectCharacters.length }}
      </div>
      <div class="sf-tab" :class="{ 'is-active': tab === 'scenes' }" @click="tab = 'scenes'">
        场景 · {{ projectScenes.length }}
      </div>
      <div class="sf-tab" :class="{ 'is-active': tab === 'props' }" @click="tab = 'props'">
        道具 · {{ projectProps.length }}
      </div>
    </div>

    <!-- Characters -->
    <div v-if="tab === 'characters'" class="sf-grid sf-grid--cards">
      <PanelCard v-for="ch in projectCharacters" :key="ch.id">
        <div class="sf-row" style="gap: 14px; align-items: flex-start">
          <div class="sf-thumb" style="width: 84px; flex-shrink: 0">
            <span v-if="ch.referenceImageUrl">🖼️</span>
            <span v-else>无图</span>
          </div>
          <div style="min-width: 0">
            <div class="sf-row sf-row--between sf-mb-8">
              <h3 class="sf-card__title">{{ ch.name }}</h3>
              <span class="sf-tag">{{ ch.role }}</span>
            </div>
            <p class="sf-muted" style="font-size: 12.5px">{{ ch.appearance }}</p>
            <p class="sf-faint" style="font-size: 12px">{{ ch.personality }}</p>
            <RouterLink
              :to="{ name: 'character-image', params: { id: projectId, characterId: ch.id } }"
              class="sf-mt-8"
              style="display: inline-block"
            >
              <MockButton :label="ch.referenceImageUrl ? '查看参考图' : '生成参考图'" size="sm" icon="🖼️" />
            </RouterLink>
          </div>
        </div>
      </PanelCard>
    </div>

    <!-- Scenes -->
    <div v-else-if="tab === 'scenes'" class="sf-grid sf-grid--cards">
      <PanelCard v-for="sc in projectScenes" :key="sc.id" :title="sc.name">
        <template #actions><span class="sf-tag">{{ sc.mood }}</span></template>
        <div class="sf-thumb sf-thumb--wide sf-mb-8">🏞️</div>
        <p class="sf-muted">{{ sc.description }}</p>
      </PanelCard>
    </div>

    <!-- Props -->
    <div v-else class="sf-grid sf-grid--cards">
      <PanelCard v-for="pr in projectProps" :key="pr.id" :title="pr.name">
        <p class="sf-muted">{{ pr.description }}</p>
      </PanelCard>
    </div>
  </div>
</template>
