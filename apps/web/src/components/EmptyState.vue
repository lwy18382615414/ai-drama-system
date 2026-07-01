<script setup lang="ts">
defineProps<{ icon?: string; title: string; desc?: string }>();
</script>

<template>
  <div class="sf-empty">
    <div class="sf-empty__icon">{{ icon ?? "📭" }}</div>
    <div class="sf-empty__title">{{ title }}</div>
    <div v-if="desc" class="sf-faint">{{ desc }}</div>
    <div v-if="$slots.default" class="sf-mt-16">
      <slot />
    </div>
  </div>
</template>
