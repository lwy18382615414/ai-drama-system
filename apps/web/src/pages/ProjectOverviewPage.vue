<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { episodes } from '@/mock'
import { useProject } from '@/composables/useProject'
import PipelineSteps from '@/components/PipelineSteps.vue'
import StatCard from '@/components/StatCard.vue'
import PanelCard from '@/components/PanelCard.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import MockButton from '@/components/MockButton.vue'
import EmptyState from '@/components/EmptyState.vue'

const { projectId, project } = useProject()
const projectEpisodes = computed(() => episodes.filter((e) => e.projectId === projectId.value))
</script>

<template>
  <div v-if="project">
    <div class="sf-page-head">
      <div>
        <h1 class="sf-page-title">{{ project.title }}</h1>
        <p class="sf-page-desc">{{ project.description }}</p>
      </div>
      <StatusBadge :status="project.status" />
    </div>

    <PipelineSteps active-key="storyboard" />

    <div class="sf-grid sf-grid--stats sf-mb-16">
      <StatCard label="剧集" :value="project.episodeCount" hint="已规划" icon="🎬" />
      <StatCard label="角色" :value="project.characterCount" hint="已提取" icon="🎭" />
      <StatCard label="场景" :value="project.sceneCount" icon="🏞️" />
      <StatCard label="分镜" :value="project.storyboardCount" icon="🎞️" />
      <StatCard label="参考图进度" :value="project.imageCompletion + '%'" hint="角色参考图" icon="🖼️" />
    </div>

    <PanelCard title="剧集">
      <template #actions>
        <RouterLink :to="{ name: 'episodes', params: { id: projectId } }">
          <MockButton label="剧集规划" size="sm" variant="ghost" />
        </RouterLink>
      </template>

      <EmptyState v-if="!projectEpisodes.length" icon="🎬" title="尚未规划剧集" desc="导入小说并提取事件后即可规划剧集。" />
      <table v-else class="sf-table">
        <thead>
          <tr>
            <th>集数</th>
            <th>标题</th>
            <th>梗概</th>
            <th>状态</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="ep in projectEpisodes" :key="ep.id">
            <td><strong>第 {{ ep.episodeNo }} 集</strong></td>
            <td><strong>{{ ep.title }}</strong></td>
            <td>{{ ep.synopsis }}</td>
            <td><StatusBadge :status="ep.status" /></td>
            <td>
              <RouterLink
                :to="{ name: 'storyboards', params: { id: projectId, episodeId: ep.id } }"
                class="sf-muted"
              >分镜 →</RouterLink>
            </td>
          </tr>
        </tbody>
      </table>
    </PanelCard>
  </div>

  <EmptyState v-else icon="🚫" title="项目不存在" desc="请返回项目列表重新选择。" />
</template>
