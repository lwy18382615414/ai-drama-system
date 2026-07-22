<script setup lang="ts">
import { useRoute } from 'vue-router'
import { computed } from 'vue'
import PagePlaceholder from '@/components/PagePlaceholder.vue'
// 场景详情 (README §7)。时段/氛围变体 + 关联镜头。
const route = useRoute()
const sceneId = computed(() => String(route.params.sceneId ?? ''))
</script>

<template>
  <PagePlaceholder
    title="场景详情"
    :note="`TODO：时段/氛围变体网格 + 关联镜头列表（sceneId: ${sceneId}）。`"
  />
</template>
