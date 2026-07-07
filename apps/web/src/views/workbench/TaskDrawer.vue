<template>
  <div class="wb-drawer">
    <div class="dhd">
      <span class="dtitle">任务中心</span>
      <button class="iconbtn" @click="emit('close')">✕</button>
    </div>

    <div v-for="t in tasks" :key="t.taskId" class="task">
      <span class="tname">{{ taskName(t) }}</span>
      <span class="tmeta">
        <span :class="chipClass(t.status)">{{ statusLabel(t.status) }}</span>
        <span v-if="t.retryCount > 0">重试 {{ t.retryCount }} 次 · </span>
        {{ relativeTime(t.updatedAt) }}
      </span>
      <span v-if="t.errorMessage" class="tmeta" style="color: #a4432f">{{ t.errorMessage }}</span>
    </div>

    <p v-if="tasks.length === 0" class="empty-note">暂无进行中或近期完成的任务</p>
    <p v-else class="empty-note" style="text-align: left; padding: 14px 0 0">
      所有生成任务统一在此注册与轮询,完成后自动刷新。
    </p>
  </div>
</template>

<script setup lang="ts">
import type { TaskEvent } from '@/composables/useTaskStream'

defineProps<{ tasks: TaskEvent[] }>()
const emit = defineEmits<{ close: [] }>()

const TASK_TYPE_LABELS: Record<string, string> = {
  event_extraction: '事件提取',
  episode_planning: '剧集规划',
  script_generation: '剧本生成',
  asset_extraction: '资产提取',
  storyboard_generation: '分镜生成',
  character_image: '角色参考图',
  scene_image: '场景参考图',
  storyboard_first_frame: '分镜首帧图',
}

function taskName(t: TaskEvent): string {
  return TASK_TYPE_LABELS[t.taskType] ?? t.taskType
}

function statusLabel(status: string): string {
  return (
    { pending: '排队中', running: '进行中', completed: '已完成', failed: '失败' }[status] ?? status
  )
}

function chipClass(status: string): string {
  if (status === 'completed') return 'chip ok'
  if (status === 'failed') return 'chip warn'
  if (status === 'pending' || status === 'running') return 'chip run'
  return 'chip'
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const min = Math.floor((Date.now() - then) / 60_000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} 小时前`
  return new Date(iso).toLocaleString('zh-CN')
}
</script>

<style scoped>
.wb-drawer {
  position: fixed;
  top: 53px;
  right: 0;
  bottom: 0;
  width: 352px;
  background: #fff;
  border-left: 1px solid #e8e7e3;
  box-shadow: -10px 0 28px rgba(0, 0, 0, 0.07);
  z-index: 40;
  padding: 18px;
  overflow: auto;
  font-family: -apple-system, 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif;
}
.dhd {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.dtitle {
  font-size: 14px;
  font-weight: 700;
}
.iconbtn {
  border: 0;
  background: transparent;
  font-size: 15px;
  color: #8a8d94;
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
}
.task {
  border: 1px solid #eeede9;
  border-radius: 8px;
  padding: 11px 13px;
  margin-bottom: 9px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.tname {
  font-size: 13px;
  font-weight: 600;
}
.tmeta {
  font-size: 11.5px;
  color: #8a8d94;
  display: flex;
  align-items: center;
  gap: 8px;
}
.chip {
  display: inline-flex;
  align-items: center;
  font-size: 11px;
  padding: 2px 9px;
  border-radius: 99px;
  background: #f1f0ed;
  color: #5c5f66;
  font-weight: 500;
}
.chip.ok {
  background: #e2f5ea;
  color: #177a48;
}
.chip.run {
  background: #fbe6dd;
  color: #a4432f;
}
.chip.warn {
  background: #fdeae6;
  color: #a4432f;
}
.empty-note {
  font-size: 12.5px;
  color: #9a9da4;
  text-align: center;
  padding: 30px 10px;
}
</style>
