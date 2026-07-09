<template>
  <div :class="['pane', inspOn ? '' : 'noinsp']">
    <!-- Category tree -->
    <aside class="tree">
      <div class="thead">资产分类</div>
      <button
        v-for="(cat, i) in categories"
        :key="cat.key"
        :class="['trow', i === activeCat ? 'on' : '']"
        @click="selectCat(i)"
      >
        {{ cat.label }}
        <span class="tick" style="color: #9a9da4; font-size: 12px">{{ cat.items.length }}</span>
      </button>
    </aside>

    <!-- Card grid -->
    <div class="canvas">
      <div v-if="loading" class="empty">
        <span class="spin" style="margin: 0; width: 18px; height: 18px"></span>
        <span class="emptyti">加载资产…</span>
      </div>
      <div v-else-if="items.length" class="cardgrid">
        <button
          v-for="(a, i) in items"
          :key="a.id"
          :class="['acard', i === activeIdx ? 'on' : '']"
          @click="activeIdx = i"
        >
          <div
            v-if="a.referenceImageUrl"
            class="avatar"
            :style="{ backgroundImage: `url(${assetUrl(a.referenceImageUrl)})` }"
          ></div>
          <div v-else class="avatar thumb none" style="aspect-ratio: 1/1">无参考图</div>
          <div class="acft">
            <div class="acname">{{ a.name }}</div>
            <div class="acsub">{{ a.sub }}</div>
          </div>
        </button>
      </div>
      <div v-else class="empty">
        <span class="emptyti">暂无{{ categories[activeCat].label }}</span>
        <span style="font-size: 11.5px">由剧本资产提取生成</span>
      </div>
    </div>

    <!-- Inspector -->
    <aside v-if="inspOn" class="insp">
      <template v-if="activeItem">
        <p class="ihead">{{ categories[activeCat].label }}</p>
        <p class="ititle">{{ activeItem.name }}</p>
        <div v-for="f in activeItem.fields" :key="f.label" class="frow">
          <span class="flabel">{{ f.label }}</span><span class="fval">{{ f.value || '—' }}</span>
        </div>

        <template v-if="activeItem.prompt !== undefined">
          <div class="sec">合成提示词</div>
          <div class="pblock mono">{{ activeItem.prompt || '—' }}</div>
        </template>

        <template v-if="activeItem.canGenerate">
          <div class="sec">参考图</div>
          <el-image
            v-if="activeItem.referenceImageUrl"
            class="refimg"
            :src="assetUrl(activeItem.referenceImageUrl)"
            :preview-src-list="previewList"
            :initial-index="previewIndex"
            fit="cover"
            preview-teleported
          />
          <div v-else class="refimg thumb none">尚无参考图</div>
          <button class="btn blk pri" :disabled="busy" @click="generateImage">✨ 生成参考图</button>
        </template>
        <template v-else>
          <div class="sec">说明</div>
          <p class="fval" style="font-size: 13px; margin: 0; line-height: 1.7">
            道具为只读详情,由剧本资产提取自动生成。
          </p>
        </template>
      </template>
      <p v-else class="fval" style="color: #9a9da4; padding: 20px 0; text-align: center">
        选择一个资产查看详情
      </p>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, toRef, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { assetUrl, workbenchApi } from '@/api'
import type { Character, Prop, Scene } from '@/api/workbench'
import { useTaskStream } from '@/composables/useTaskStream'

const props = defineProps<{ projectId: string; inspOn: boolean }>()

const { tasks: streamTasks } = useTaskStream(toRef(props, 'projectId'))

const characters = ref<Character[]>([])
const scenes = ref<Scene[]>([])
const propsList = ref<Prop[]>([])
const loading = ref(false)
const activeCat = ref(0)
const activeIdx = ref(0)
const busy = ref(false)

interface AssetField {
  label: string
  value: string | null
}
interface AssetItem {
  id: string
  name: string
  sub: string
  referenceImageUrl: string | null
  fields: AssetField[]
  prompt?: string | null
  canGenerate: boolean
  kind: 'character' | 'scene' | 'prop'
}

const categories = computed(() => [
  { key: 'character', label: '角色', items: characters.value.map(toCharacterItem) },
  { key: 'scene', label: '场景', items: scenes.value.map(toSceneItem) },
  { key: 'prop', label: '道具', items: propsList.value.map(toPropItem) },
])

const items = computed<AssetItem[]>(() => categories.value[activeCat.value].items)
const activeItem = computed<AssetItem | null>(() => items.value[activeIdx.value] ?? null)

// Whole-pane preview: arrow through every item in the *current category* that has
// a reference image, in grid order. Index of imageless items is excluded, so the
// selected item's position is looked up by its resolved URL.
const previewList = computed(() =>
  items.value
    .filter((it) => it.referenceImageUrl)
    .map((it) => assetUrl(it.referenceImageUrl!)),
)
const previewIndex = computed(() => {
  const url = activeItem.value?.referenceImageUrl
  if (!url) return 0
  return Math.max(0, previewList.value.indexOf(assetUrl(url)))
})

function toCharacterItem(c: Character): AssetItem {
  return {
    id: c.id,
    name: c.name,
    sub: [c.age, c.role].filter(Boolean).join(' · ') || '角色',
    referenceImageUrl: c.referenceImageUrl,
    fields: [
      { label: '外貌', value: c.appearance },
      { label: '性格', value: c.personality },
    ],
    prompt: c.appearance,
    canGenerate: true,
    kind: 'character',
  }
}

function toSceneItem(s: Scene): AssetItem {
  return {
    id: s.id,
    name: s.name,
    sub: s.locationType || '场景',
    referenceImageUrl: s.referenceImageUrl,
    fields: [
      { label: '描述', value: s.description },
      { label: '风格', value: s.visualStyle },
    ],
    prompt: s.visualPrompt,
    canGenerate: true,
    kind: 'scene',
  }
}

function toPropItem(p: Prop): AssetItem {
  return {
    id: p.id,
    name: p.name,
    sub: p.significance || '道具',
    referenceImageUrl: p.referenceImageUrl,
    fields: [
      { label: '描述', value: p.description },
      { label: '意义', value: p.significance },
    ],
    canGenerate: false,
    kind: 'prop',
  }
}

function selectCat(i: number) {
  activeCat.value = i
  activeIdx.value = 0
}

async function load() {
  loading.value = true
  try {
    const [c, s, p] = await Promise.all([
      workbenchApi.getCharacters(props.projectId),
      workbenchApi.getScenes(props.projectId),
      workbenchApi.getProps(props.projectId),
    ])
    characters.value = c.characters
    scenes.value = s.scenes
    propsList.value = p.props
  } finally {
    loading.value = false
  }
}

async function generateImage() {
  const item = activeItem.value
  if (!item || !item.canGenerate) return
  busy.value = true
  try {
    if (item.kind === 'character') await workbenchApi.generateCharacterImage(item.id)
    else if (item.kind === 'scene') await workbenchApi.generateSceneImage(item.id)
    ElMessage.success('已提交参考图生成任务,可在任务中心查看进度')
  } finally {
    busy.value = false
  }
}

watch(() => props.projectId, load, { immediate: true })

// A character/scene reference-image task completing in the background writes a new
// referenceImageUrl on the row, but the async enqueue endpoint only returns a task
// ack — so reload the assets when one settles to surface the freshly generated image.
const completedRefImageCount = computed(
  () =>
    streamTasks.value.filter(
      (t) =>
        t.taskType === 'image_generation' &&
        (t.targetType === 'character_reference_image' ||
          t.targetType === 'scene_reference_image') &&
        t.status === 'completed',
    ).length,
)

watch(completedRefImageCount, (n, prev) => {
  if (n > (prev ?? 0)) void load()
})
</script>

<style scoped>
.pane {
  display: grid;
  grid-template-columns: 252px minmax(0, 1fr) 336px;
  overflow: hidden;
  flex: 1;
  min-height: 0;
}
.pane.noinsp {
  grid-template-columns: 252px minmax(0, 1fr);
}
.tree {
  background: #fbfbfa;
  border-right: 1px solid #e8e7e3;
  overflow: auto;
  padding: 14px 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.thead {
  font-size: 11px;
  font-weight: 600;
  color: #9a9da4;
  letter-spacing: 0.08em;
  padding: 2px 10px 8px;
}
.trow {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 6px;
  font-size: 13px;
  color: #3a3d44;
  cursor: pointer;
  border: 0;
  background: transparent;
  text-align: left;
  width: 100%;
  font-family: inherit;
}
.trow:hover {
  background: #f2f1ec;
}
.trow.on {
  background: #ecebe6;
  font-weight: 600;
  color: #1f2126;
}
.tick {
  font-size: 11px;
  margin-left: auto;
}
.spin {
  width: 11px;
  height: 11px;
  border: 2px solid #e2d2c8;
  border-top-color: #cf6134;
  border-radius: 50%;
  animation: rot 0.9s linear infinite;
  flex: none;
}
@keyframes rot {
  to {
    transform: rotate(360deg);
  }
}
.canvas {
  overflow: auto;
  min-width: 0;
}
.insp {
  background: #fff;
  border-left: 1px solid #e8e7e3;
  overflow: auto;
  padding: 20px 20px 36px;
}
.ihead {
  font-size: 11px;
  font-weight: 600;
  color: #9a9da4;
  letter-spacing: 0.08em;
  margin: 0 0 6px;
}
.ititle {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 4px;
}
.frow {
  padding: 8px 0;
  border-bottom: 1px solid #f2f1ee;
  font-size: 13px;
  display: flex;
  gap: 12px;
  align-items: baseline;
}
.flabel {
  color: #9a9da4;
  width: 62px;
  flex: none;
  font-size: 12px;
}
.fval {
  color: #2a2d33;
  line-height: 1.55;
}
.sec {
  font-size: 11px;
  font-weight: 600;
  color: #9a9da4;
  letter-spacing: 0.08em;
  margin: 20px 0 8px;
}
.btn {
  border: 1px solid #dcdbd6;
  background: #fff;
  border-radius: 6px;
  padding: 6px 13px;
  font-size: 12.5px;
  cursor: pointer;
  color: #2a2d33;
  font-weight: 500;
  font-family: inherit;
}
.btn.pri {
  background: #cf6134;
  border-color: #cf6134;
  color: #fff;
}
.btn.pri:hover {
  background: #bb5329;
}
.btn[disabled] {
  cursor: not-allowed;
  opacity: 0.55;
}
.btn.blk {
  width: 100%;
  margin-top: 2px;
}
.mono {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  height: 100%;
  color: #8a8d94;
  font-size: 13px;
  text-align: center;
  padding: 40px;
}
.emptyti {
  font-size: 15px;
  font-weight: 600;
  color: #4a4d54;
}
.pblock {
  background: #f7f7f4;
  border: 1px solid #ececec;
  border-radius: 7px;
  padding: 10px 12px;
  font-size: 11.5px;
  line-height: 1.7;
  color: #4a4d54;
  white-space: pre-wrap;
  word-break: break-word;
}
.thumb.none {
  background: #fafaf8;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #b4b6bc;
  font-size: 11px;
}

/* Assets mode */
.cardgrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
  gap: 14px;
  padding: 24px 26px;
}
.acard {
  background: #fff;
  border: 1px solid #e8e7e3;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  padding: 0;
  text-align: left;
  font-family: inherit;
}
.acard.on {
  border-color: #cf6134;
  box-shadow: 0 0 0 1px #cf6134;
}
.avatar {
  aspect-ratio: 1 / 1;
  background-size: cover;
  background-position: center;
}
.acft {
  padding: 9px 12px 11px;
}
.acname {
  font-size: 13px;
  font-weight: 600;
}
.acsub {
  font-size: 11.5px;
  color: #8a8d94;
  margin-top: 2px;
}
.refimg {
  display: block;
  width: 100%;
  aspect-ratio: 3 / 4;
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 10px;
  background-size: cover;
  background-position: center;
}
/* el-image variant: whole image is the click-to-preview target */
.el-image.refimg {
  cursor: zoom-in;
}
</style>
