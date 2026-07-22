<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'
import { computed } from 'vue'
import PagePlaceholder from '@/components/PagePlaceholder.vue'
// 管线看板（核心页，README §4 / frontend-design.md §5.1）。
// 骨架阶段提供一个进入集工作区的演示链接以验证跳转。
const route = useRoute()
const projectId = computed(() => String(route.params.projectId ?? ''))
</script>

<template>
  <PagePlaceholder title="管线看板" note="TODO：批量 pipeline status 看板 + 多选批量操作 + 虚拟滚动。">
    <p style="margin-top: 16px">
      <RouterLink
        :to="{ name: 'episode-script', params: { episodeId: 'demo-ep-1' } }"
        style="color: #18a058"
      >
        打开示例集工作区 →
      </RouterLink>
      （projectId: {{ projectId }}）
    </p>
  </PagePlaceholder>
</template>
