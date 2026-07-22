<script setup lang="ts">
// 骨架阶段的空页体占位：仅显示页名 + TODO，用于验证路由跳转。
defineProps<{ title: string; note?: string }>()
</script>

<template>
  <section class="page-placeholder">
    <h1 class="title">{{ title }}</h1>
    <p class="note">{{ note ?? 'TODO：按设计稿实现此页面。' }}</p>
    <slot />
  </section>
</template>

<style scoped>
.page-placeholder {
  max-width: 960px;
}
.title {
  font-size: 20px;
  font-weight: 600;
  color: #1f2225;
  margin: 0 0 8px;
}
.note {
  font-size: 13px;
  color: #8a9099;
  margin: 0;
}
</style>
