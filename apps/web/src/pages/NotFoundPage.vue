<script setup lang="ts">
import EmptyState from '@/components/EmptyState.vue'
import MockButton from '@/components/MockButton.vue'
import { RouterLink } from 'vue-router'
</script>

<template>
  <EmptyState icon="🧭" title="页面未找到" desc="你访问的路径不存在。">
    <RouterLink to="/"><MockButton label="返回项目列表" variant="primary" /></RouterLink>
  </EmptyState>
</template>
