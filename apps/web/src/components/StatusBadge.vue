<script setup lang="ts">
import { computed } from 'vue'
import type { PipelineStatus } from '@/types'

const props = defineProps<{ status: PipelineStatus }>()

const LABELS: Record<PipelineStatus, string> = {
  draft: '草稿',
  generating: '生成中',
  done: '已完成',
  failed: '失败',
}

const label = computed(() => LABELS[props.status])
</script>

<template>
  <span class="sf-badge" :class="`sf-badge--${status}`">
    <span class="sf-badge__dot" />
    {{ label }}
  </span>
</template>
