<template>
  <button
    type="button"
    class="sf-btn"
    :class="[
      variant === 'primary' && 'sf-btn--primary',
      variant === 'ghost' && 'sf-btn--ghost',
      size === 'sm' && 'sf-btn--sm',
    ]"
    :title="hint ?? '演示按钮（未接后端）'"
    @click="onClick"
  >
    <span v-if="icon">{{ icon }}</span>
    {{ flashed ? '演示模式 ✓' : label }}
  </button>
</template>

<script setup lang="ts">
import { ref } from 'vue'

/**
 * Visual-only button. Phase 1 has no backend, so clicking just flashes a
 * transient "mock" hint instead of performing any action.
 */
withDefaults(
  defineProps<{
    label: string
    variant?: 'primary' | 'default' | 'ghost'
    size?: 'sm' | 'md'
    icon?: string
    hint?: string
  }>(),
  { variant: 'default', size: 'md' },
)

const flashed = ref(false)
function onClick() {
  flashed.value = true
  window.setTimeout(() => (flashed.value = false), 1400)
}
</script>
