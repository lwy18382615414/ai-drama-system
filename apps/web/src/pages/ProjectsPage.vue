<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { deleteProject, listProjects, type ProjectSummary } from '@/api/projects'
import { getApiErrorMessage } from '@/api/client'
import { useTaskCenter } from '@/store/taskCenter'
import CreateProjectModal from '@/components/workbench/CreateProjectModal.vue'

const message = useMessage()
const dialog = useDialog()
const router = useRouter()
const taskCenter = useTaskCenter()

const projects = ref<ProjectSummary[]>([])
const loading = ref(false)
const createOpen = ref(false)

async function load() {
  loading.value = true
  try {
    projects.value = await listProjects()
  } catch (error) {
    message.error(getApiErrorMessage(error))
  } finally {
    loading.value = false
  }
}

onMounted(load)

// A dark cover gradient per project, stable across reloads (hashed off the id) since there's no real cover art yet.
const COVERS = [
  'linear-gradient(135deg,#3a4a6b 0%,#1f2740 100%)',
  'linear-gradient(135deg,#8a6d3b 0%,#4a3a22 100%)',
  'linear-gradient(135deg,#3d6b63 0%,#1f3a35 100%)',
  'linear-gradient(135deg,#6b3a54 0%,#331b28 100%)',
  'linear-gradient(135deg,#4a5a3a 0%,#232b1a 100%)',
]

function coverFor(id: string) {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return { background: COVERS[hash % COVERS.length] }
}

interface StageRow {
  label: string
  pct: number
  num: string
}

function stagesFor(p: ProjectSummary): StageRow[] {
  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0)
  const novel = p.chapterCount > 0 ? 100 : 0
  const script = pct(p.scriptCount, p.episodeCount)
  const board = pct(p.storyboardEpisodeCount, p.episodeCount)
  const image = p.imageCompletion

  return [
    { label: '小说', pct: novel, num: novel === 100 ? '完成' : novel + '%' },
    { label: '剧本', pct: script, num: script === 100 && p.episodeCount > 0 ? '完成' : script + '%' },
    { label: '分镜', pct: board, num: board === 100 && p.episodeCount > 0 ? '完成' : board + '%' },
    { label: '出图', pct: image, num: image === 100 ? '完成' : image + '%' },
  ]
}

function relativeTime(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} 天前`
  return iso.slice(0, 10)
}

function enter(id: string) {
  void router.push({ name: 'workbench', params: { id } })
}

function confirmDelete(project: ProjectSummary, event: Event) {
  event.stopPropagation()
  dialog.warning({
    title: '删除项目',
    content: `确定删除项目"${project.title}"吗？其章节、剧集、剧本、素材等所有数据将一并删除，且无法恢复。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await deleteProject(project.id)
        message.success('项目已删除')
        void load()
      } catch (error) {
        message.error(getApiErrorMessage(error))
      }
    },
  })
}

const totalLabel = computed(() => `共 ${projects.value.length} 个项目 · 从小说到成片，一个工作台完成`)
</script>

<template>
  <div class="wb-root">
    <div class="wb-list" data-screen-label="项目列表">
      <header class="wb-lhead">
        <span class="wb-brand">AI 短剧<span class="wb-dotp">·</span>工作台</span>
        <button v-if="taskCenter.runningCount.value > 0" class="wb-gtask" @click="taskCenter.toggleDrawer">
          ⚡ {{ taskCenter.runningCount.value }} 个任务进行中
        </button>
        <button class="wb-iconbtn">⚙</button>
      </header>

      <div class="wb-lbody">
        <div class="wb-lrow">
          <div>
            <h1 class="wb-ltitle">我的项目</h1>
            <p class="wb-lsub">{{ totalLabel }}</p>
          </div>
          <button class="wb-newbtn" @click="createOpen = true">＋ 新建项目</button>
        </div>

        <n-spin :show="loading">
          <div v-if="!loading && !projects.length" class="wb-empty" style="min-height: 320px">
            <span class="wb-emptyti">暂无项目</span>
            <span>从一本小说开始创建你的第一个短剧项目</span>
            <button class="wb-btn pri" @click="createOpen = true">＋ 新建项目</button>
          </div>

          <div v-else class="wb-pgrid">
            <button v-for="p in projects" :key="p.id" class="wb-pcard" @click="enter(p.id)">
              <div class="wb-pcover" :style="coverFor(p.id)">
                <span class="wb-pill">{{ p.genre }}</span>
                <span v-if="taskCenter.runningCountFor(p.id) > 0" class="wb-runp">
                  <span class="wb-spin" />⚡ {{ taskCenter.runningCountFor(p.id) }}
                </span>
              </div>
              <div class="wb-pcbody">
                <div class="wb-fx wb-jb wb-ac">
                  <div class="wb-pcname">{{ p.title }}</div>
                  <button class="wb-iconbtn" title="删除项目" @click="confirmDelete(p, $event)">🗑</button>
                </div>
                <div class="wb-pcmeta">{{ p.episodeCount }} 集 · {{ p.genre }} · {{ p.targetPlatform }}</div>
                <div class="wb-stages">
                  <div v-for="s in stagesFor(p)" :key="s.label" class="wb-strow">
                    <span class="wb-slabel">{{ s.label }}</span>
                    <div class="wb-sbar"><div :class="['wb-sbarf', { full: s.pct === 100 }]" :style="{ width: s.pct + '%' }" /></div>
                    <span class="wb-snum">{{ s.num }}</span>
                  </div>
                </div>
                <div class="wb-pcfoot">
                  <span>{{ relativeTime(p.updatedAt) }}</span>
                  <span class="wb-go">进入 →</span>
                </div>
              </div>
            </button>

            <button class="wb-pcard wb-ncard" @click="createOpen = true">
              <span class="wb-nplus">＋</span>新建项目
              <span style="font-size: 11.5px; color: #b0b2b8">粘贴小说 · 10 秒开工</span>
            </button>
          </div>
        </n-spin>
      </div>
    </div>

    <CreateProjectModal v-if="createOpen" @close="createOpen = false" />
  </div>
</template>
