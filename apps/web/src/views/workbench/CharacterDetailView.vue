<script setup lang="ts">
import { useRoute } from 'vue-router'
import { computed } from 'vue'
import PagePlaceholder from '@/components/PagePlaceholder.vue'
// 资产详情（角色）(README §6)。含形象参考图 + 形象版本时间轴。
const route = useRoute()
const characterId = computed(() => String(route.params.characterId ?? ''))
</script>

<template>
  <PagePlaceholder
    title="角色详情"
    :note="`TODO：形象参考图 + AppearanceTimeline + 受影响内容（characterId: ${characterId}）。`"
  />
</template>
