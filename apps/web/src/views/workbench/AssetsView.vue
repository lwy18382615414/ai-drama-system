<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'
import { computed } from 'vue'
import PagePlaceholder from '@/components/PagePlaceholder.vue'
// 资产库 (README §8)。角色/场景为详情页，道具为抽屉。
const route = useRoute()
const projectId = computed(() => String(route.params.projectId ?? ''))
</script>

<template>
  <PagePlaceholder title="资产库" note="TODO：角色/场景/道具胶囊切换 + 卡片网格 + 道具详情抽屉。">
    <p style="margin-top: 16px; display: flex; gap: 16px">
      <RouterLink
        :to="{ name: 'character-detail', params: { projectId, characterId: 'demo-char-1' } }"
        style="color: #18a058"
      >
        角色详情示例 →
      </RouterLink>
      <RouterLink
        :to="{ name: 'scene-detail', params: { projectId, sceneId: 'demo-scene-1' } }"
        style="color: #18a058"
      >
        场景详情示例 →
      </RouterLink>
    </p>
  </PagePlaceholder>
</template>
