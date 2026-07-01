<script setup lang="ts">
import { pipelineSteps } from '@/mock'

/**
 * Narrative-pipeline stepper. `activeKey` marks the current stage; every step
 * before it is shown as done. Purely presentational for the Phase 1 skeleton.
 */
const props = defineProps<{ activeKey?: string }>()

const activeIndex = pipelineSteps.findIndex((s) => s.key === props.activeKey)

function stateOf(index: number): 'done' | 'active' | 'todo' {
  if (activeIndex === -1) return 'todo'
  if (index < activeIndex) return 'done'
  if (index === activeIndex) return 'active'
  return 'todo'
}
</script>

<template>
  <div class="sf-pipeline">
    <template v-for="(step, i) in pipelineSteps" :key="step.key">
      <span
        class="sf-step"
        :class="{ 'is-done': stateOf(i) === 'done', 'is-active': stateOf(i) === 'active' }"
      >
        <span class="sf-step__idx">{{ stateOf(i) === "done" ? "✓" : i + 1 }}</span>
        {{ step.label }}
      </span>
      <span v-if="i < pipelineSteps.length - 1" class="sf-step__arrow">→</span>
    </template>
  </div>
</template>
