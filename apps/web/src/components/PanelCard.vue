<script setup lang="ts">
defineProps<{ title?: string; framed?: boolean }>()
</script>

<template>
  <section class="sf-card" :class="{ 'sf-framed': framed }">
    <header v-if="title || $slots.actions" class="sf-card__head">
      <h3 class="sf-card__title">{{ title }}</h3>
      <div class="sf-row"><slot name="actions" /></div>
    </header>
    <div class="sf-card__body">
      <slot />
    </div>
  </section>
</template>
