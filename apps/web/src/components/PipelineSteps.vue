<script setup lang="ts">
import { pipelineSteps } from '@/constants/pipeline'

/**
 * Narrative-pipeline tab strip. Purely a location indicator: the step matching
 * `activeKey` (the current page) is highlighted, all others render neutrally.
 * It carries no completion semantics — omit `activeKey` to show a plain
 * workflow map (e.g. on the project overview page).
 */
const props = defineProps<{ activeKey?: string }>()

const activeIndex = pipelineSteps.findIndex((s) => s.key === props.activeKey)
</script>

<template>
  <div class="sf-pipeline">
    <template v-for="(step, i) in pipelineSteps" :key="step.key">
      <span class="sf-step" :class="{ 'is-active': i === activeIndex }">
        <span class="sf-step__idx">{{ i + 1 }}</span>
        {{ step.label }}
      </span>
      <span v-if="i < pipelineSteps.length - 1" class="sf-step__arrow">→</span>
    </template>
  </div>
</template>
