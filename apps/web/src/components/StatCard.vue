<script setup lang="ts">
defineProps<{
  label: string
  value: string | number
  hint?: string
  icon?: string
}>()
</script>

<template>
  <div class="sf-card sf-card--pad">
    <div class="sf-row sf-row--between">
      <div class="sf-stat__label">{{ label }}</div>
      <span v-if="icon" class="sf-faint">{{ icon }}</span>
    </div>
    <div class="sf-stat__value">{{ value }}</div>
    <div v-if="hint" class="sf-stat__hint">{{ hint }}</div>
  </div>
</template>
