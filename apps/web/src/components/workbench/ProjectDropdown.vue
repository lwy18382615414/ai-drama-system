<script setup lang="ts">
import { computed, inject } from 'vue'
import { useRouter } from 'vue-router'
import { WorkbenchKey } from '@/composables/workbenchKey'

const emit = defineEmits<{ close: []; edit: [] }>()
const wb = inject(WorkbenchKey)!
const router = useRouter()

const project = computed(() => wb.state.project)

interface ImageBar {
  label: string
  completed: number
  total: number
}

const imageBars = computed<ImageBar[]>(() => {
  const characters = wb.state.characters
  const scenes = wb.state.scenes
  const shots = Array.from(wb.state.storyboardsByEpisode.values()).flat()

  return [
    { label: '角色参考图', completed: characters.filter((c) => c.referenceImageUrl).length, total: characters.length },
    { label: '场景参考图', completed: scenes.filter((s) => s.referenceImageUrl).length, total: scenes.length },
    { label: '分镜首帧图', completed: shots.filter((s) => s.firstFrameImageUrl).length, total: shots.length },
  ]
})

function barWidth(bar: ImageBar) {
  if (bar.total === 0) return '0%'
  return Math.round((bar.completed / bar.total) * 100) + '%'
}

function backToList() {
  emit('close')
  void router.push({ name: 'projects' })
}
</script>

<template>
  <div class="wb-pjdrop" v-if="project" @click.stop>
    <p class="wb-pjname">{{ project.title }}</p>
    <p class="wb-pjsub">{{ project.genre }} · {{ project.episodeCount }} 集 · 创建于 {{ project.createdAt.slice(0, 10) }}</p>

    <div class="wb-sec wb-m0">阶段统计</div>
    <div class="wb-statrow wb-mt8">
      <span class="wb-chip">章节 {{ project.chapterCount }}</span>
      <span class="wb-chip">事件 {{ project.eventCount }}</span>
      <span class="wb-chip">剧集 {{ project.episodeCount }}</span>
      <span class="wb-chip">镜头 {{ project.storyboardCount }}</span>
    </div>

    <div class="wb-sec">图片完成率</div>
    <div v-for="bar in imageBars" :key="bar.label" class="wb-brow">
      <span class="wb-blabel">{{ bar.label }}</span>
      <div class="wb-bar"><div class="wb-barf" :style="{ width: barWidth(bar) }" /></div>
      <span class="wb-bnum">{{ bar.completed }}/{{ bar.total }}</span>
    </div>

    <div class="wb-divider" />
    <div class="wb-fx wb-jb wb-ac">
      <button class="wb-linkbtn" style="width: auto" @click="backToList">← 返回项目列表</button>
      <button class="wb-btn" @click="emit('edit')">编辑项目信息</button>
    </div>
  </div>
</template>
