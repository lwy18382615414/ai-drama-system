<script setup lang="ts">
import { useTaskCenter } from '@/store/taskCenter'

const taskCenter = useTaskCenter()

const STATUS_LABEL: Record<string, string> = {
  pending: '等待中',
  running: '进行中',
  completed: '已完成',
  failed: '失败',
}

const STATUS_CLS: Record<string, string> = {
  pending: 'wb-chip run',
  running: 'wb-chip run',
  completed: 'wb-chip ok',
  failed: 'wb-chip warn',
}

function elapsed(startedAt: number) {
  const seconds = Math.round((Date.now() - startedAt) / 1000)
  if (seconds < 60) return `已用时 ${seconds} 秒`
  return `已用时 ${Math.round(seconds / 60)} 分钟`
}
</script>

<template>
  <div class="wb-drawer" @click.stop>
    <div class="wb-dhd">
      <span class="wb-dtitle">任务中心</span>
      <button class="wb-iconbtn" @click="taskCenter.toggleDrawer">✕</button>
    </div>

    <p v-if="!taskCenter.tasks.value.length" class="wb-notchosen">暂无生成任务</p>

    <div v-for="t in taskCenter.tasks.value" :key="t.id" class="wb-task">
      <span class="wb-tname">{{ t.label }}</span>
      <span class="wb-tmeta">
        <span :class="STATUS_CLS[t.status]">{{ STATUS_LABEL[t.status] }}</span>
        <template v-if="t.status === 'failed' && t.errorMessage">{{ t.errorMessage }}</template>
        <template v-else>{{ elapsed(t.startedAt) }}</template>
      </span>
    </div>

    <p class="wb-tasknote" style="margin-top: 14px">所有生成任务统一在此注册与轮询；完成后自动刷新对应模式的数据。</p>
  </div>
</template>
