<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ value: number }>()
const clamped = computed(() => Math.max(0, Math.min(100, props.value)))
</script>

<template>
  <div class="sf-progress" role="progressbar" :aria-valuenow="clamped">
    <div class="sf-progress__fill" :style="{ width: clamped + '%' }" />
  </div>
</template>
