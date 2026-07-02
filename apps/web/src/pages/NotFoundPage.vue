<script setup lang="ts">
import EmptyState from '@/components/EmptyState.vue'
import { RouterLink } from 'vue-router'
</script>

<template>
  <EmptyState icon="🧭" title="页面未找到" desc="你访问的路径不存在。">
    <RouterLink to="/"><n-button type="primary">返回项目列表</n-button></RouterLink>
  </EmptyState>
</template>
