<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { generationTasks, getCharacter } from '@/mock'
import { useProject } from '@/composables/useProject'
import type { PipelineStatus } from '@/types'
import PipelineSteps from '@/components/PipelineSteps.vue'
import PanelCard from '@/components/PanelCard.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import MockButton from '@/components/MockButton.vue'
import EmptyState from '@/components/EmptyState.vue'

const { project } = useProject()
const route = useRoute()
const character = computed(() => getCharacter(route.params.characterId as string))

/** Tasks targeting this character's reference image (Phase 2B surface, mocked). */
const tasks = computed(() =>
  generationTasks.filter(
    (t) => t.targetType === 'character_reference_image' && t.targetId === route.params.characterId,
  ),
)

/** Built the same way the backend builds Phase 2B prompts: name/role/appearance/personality + visual style. */
const prompt = computed(() => {
  const c = character.value
  if (!c) return ''
  const style = project.value?.visualStyle ?? 'realistic'
  return `${c.name}, ${c.role}, ${c.appearance} ${c.personality} visual style: ${style}`
})

const currentStatus = computed<PipelineStatus>(() => {
  if (character.value?.referenceImageUrl) return 'done'
  if (tasks.value.some((t) => t.status === 'generating')) return 'generating'
  return 'draft'
})
</script>

<template>
  <div v-if="character">
    <div class="sf-page-head">
      <div>
        <h1 class="sf-page-title">角色参考图 · {{ character.name }}</h1>
        <p class="sf-page-desc">Phase 2B：基于角色描述与项目视觉风格，通过 MockImageProvider 生成参考图（演示）。</p>
      </div>
      <div class="sf-row">
        <StatusBadge :status="currentStatus" />
        <MockButton label="生成参考图" variant="primary" icon="✨" />
        <MockButton label="强制重生成 (force)" icon="🔁" />
      </div>
    </div>

    <PipelineSteps active-key="image" />

    <div class="sf-grid sf-grid--2">
      <PanelCard title="参考图">
        <div class="sf-thumb" style="max-width: 260px; margin: 0 auto">
          <span v-if="character.referenceImageUrl">🖼️ 已生成</span>
          <span v-else>尚未生成</span>
        </div>
      </PanelCard>

      <PanelCard title="角色设定与提示词">
        <div class="sf-field">
          <div class="sf-label">角色</div>
          <div>{{ character.name }} · <span class="sf-muted">{{ character.role }}</span></div>
        </div>
        <div class="sf-field">
          <div class="sf-label">外貌</div>
          <div class="sf-muted">{{ character.appearance }}</div>
        </div>
        <div class="sf-field">
          <div class="sf-label">性格</div>
          <div class="sf-muted">{{ character.personality }}</div>
        </div>
        <div class="sf-field">
          <div class="sf-label">合成提示词</div>
          <div class="sf-mono sf-notice">{{ prompt }}</div>
        </div>
      </PanelCard>
    </div>

    <PanelCard title="生成任务" class="sf-mt-16">
      <EmptyState v-if="!tasks.length" icon="⏳" title="暂无生成任务" desc="点击“生成参考图”将创建一个图像生成任务。" />
      <table v-else class="sf-table">
        <thead>
          <tr>
            <th>任务 ID</th>
            <th>类型</th>
            <th>状态</th>
            <th>创建时间</th>
            <th>结果</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in tasks" :key="t.id">
            <td class="sf-mono">{{ t.id }}</td>
            <td>{{ t.taskType }}</td>
            <td><StatusBadge :status="t.status" /></td>
            <td class="sf-faint">{{ new Date(t.createdAt).toLocaleString() }}</td>
            <td class="sf-mono">{{ t.resultUrl ?? "—" }}</td>
          </tr>
        </tbody>
      </table>
    </PanelCard>
  </div>

  <EmptyState v-else icon="🚫" title="角色不存在" desc="请返回资产页重新选择角色。" />
</template>
