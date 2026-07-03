<script setup lang="ts">
import { computed, inject, watch } from 'vue'
import { WorkbenchKey } from '@/composables/workbenchKey'
import { useTaskCenter } from '@/store/taskCenter'

const props = defineProps<{ inspectorCollapsed: boolean }>()
const category = defineModel<'characters' | 'scenes' | 'props'>('category', { default: 'characters' })
const assetId = defineModel<string>('assetId', { default: '' })

const wb = inject(WorkbenchKey)!
const taskCenter = useTaskCenter()

const categories = computed(() => [
  { key: 'characters' as const, title: '角色', items: wb.state.characters },
  { key: 'scenes' as const, title: '场景', items: wb.state.scenes },
  { key: 'props' as const, title: '道具', items: wb.state.props },
])

const activeCategory = computed(() => categories.value.find((c) => c.key === category.value)!)

watch(
  () => activeCategory.value.items,
  (items) => {
    if (!items.some((i) => i.id === assetId.value)) assetId.value = items[0]?.id ?? ''
  },
  { immediate: true },
)

const selectedAsset = computed(() => activeCategory.value.items.find((i) => i.id === assetId.value) ?? null)

function selectCategory(key: 'characters' | 'scenes' | 'props') {
  category.value = key
  assetId.value = ''
}

function selectAsset(id: string) {
  assetId.value = id
}

const kindLabel = computed(() => ({ characters: '角色', scenes: '场景', props: '道具' }[category.value]))

const prompt = computed(() => {
  const a = selectedAsset.value
  if (!a) return ''
  if (category.value === 'characters') {
    const c = a as (typeof wb.state.characters)[number]
    const style = wb.state.project?.visualStyle ?? 'realistic'
    return `${c.name}, ${c.role ?? ''}, ${c.appearance ?? ''} ${c.personality ?? ''} visual style: ${style}`.trim()
  }
  if (category.value === 'scenes') {
    return (a as (typeof wb.state.scenes)[number]).visualPrompt ?? ''
  }
  return ''
})

const referenceImageUrl = computed(() => (selectedAsset.value as { referenceImageUrl?: string | null } | null)?.referenceImageUrl ?? null)

function generating() {
  return !!selectedAsset.value && taskCenter.isTaskBusy(selectedAsset.value.id, 'image_generation')
}

function generate(force: boolean) {
  if (!selectedAsset.value) return
  if (category.value === 'characters') wb.actions.generateCharacterImage(selectedAsset.value.id, { force })
  else if (category.value === 'scenes') wb.actions.generateSceneImage(selectedAsset.value.id, { force })
}
</script>

<template>
  <div :class="['wb-pane', { noinsp: props.inspectorCollapsed }]" data-screen-label="资产模式">
    <aside class="wb-tree">
      <div class="wb-thead">资产分类</div>
      <button
        v-for="c in categories"
        :key="c.key"
        :class="['wb-trow', { on: c.key === category }]"
        @click="selectCategory(c.key)"
      >
        {{ c.title }}
        <span class="wb-tick" style="color: #9a9da4; font-size: 12px">{{ c.items.length }}</span>
      </button>
    </aside>

    <div class="wb-canvas">
      <div class="wb-cardgrid">
        <button
          v-for="a in activeCategory.items"
          :key="a.id"
          :class="['wb-acard', { on: a.id === selectedAsset?.id }]"
          @click="selectAsset(a.id)"
        >
          <img v-if="a.referenceImageUrl" class="wb-avatar" style="width: 100%; object-fit: cover" :src="a.referenceImageUrl" alt="" />
          <div v-else class="wb-avatar wb-ph wb-mono">{{ kindLabel }}参考图 · {{ a.name }}</div>
          <div class="wb-acft">
            <div class="wb-acname">{{ a.name }}</div>
            <div class="wb-acsub">{{ 'role' in a ? a.role : 'locationType' in a ? a.locationType ?? a.visualStyle : a.significance }}</div>
          </div>
        </button>
      </div>
    </div>

    <aside v-if="!props.inspectorCollapsed" class="wb-insp">
      <template v-if="selectedAsset">
        <p class="wb-ihead">{{ kindLabel }}</p>
        <p class="wb-ititle">{{ selectedAsset.name }}</p>

        <template v-if="category === 'characters'">
          <div class="wb-frow"><span class="wb-flabel">外貌</span><span class="wb-fval">{{ (selectedAsset as any).appearance }}</span></div>
          <div class="wb-frow"><span class="wb-flabel">性格</span><span class="wb-fval">{{ (selectedAsset as any).personality }}</span></div>
        </template>
        <template v-else-if="category === 'scenes'">
          <div class="wb-frow"><span class="wb-flabel">描述</span><span class="wb-fval">{{ (selectedAsset as any).description }}</span></div>
          <div class="wb-frow"><span class="wb-flabel">类型</span><span class="wb-fval">{{ (selectedAsset as any).locationType ?? (selectedAsset as any).visualStyle }}</span></div>
        </template>
        <template v-else>
          <div class="wb-frow"><span class="wb-flabel">描述</span><span class="wb-fval">{{ (selectedAsset as any).description }}</span></div>
          <div class="wb-frow"><span class="wb-flabel">重要性</span><span class="wb-fval">{{ (selectedAsset as any).significance }}</span></div>
        </template>

        <template v-if="category !== 'props'">
          <div class="wb-sec">合成提示词</div>
          <div class="wb-pblock wb-mono">{{ prompt }}</div>
          <div class="wb-sec">参考图</div>
          <img v-if="referenceImageUrl" class="wb-refimg" style="width: 100%; object-fit: cover" :src="referenceImageUrl" alt="" />
          <div v-else class="wb-refimg wb-ph wb-mono">{{ generating() ? '生成中…' : '待生成' }}</div>
          <div class="wb-fx wb-gap8">
            <button class="wb-btn wb-f1" :disabled="generating()" @click="generate(true)">🔁 强制重生成</button>
            <button class="wb-btn pri wb-f1" :disabled="generating()" @click="generate(false)">✨ 生成参考图</button>
          </div>
          <div class="wb-tasknote">
            <span v-if="generating()" class="wb-chip run">生成中</span>
            <span v-else-if="referenceImageUrl" class="wb-chip ok">已生成</span>
            <span v-else class="wb-chip">尚未生成</span>
          </div>
        </template>
        <template v-else>
          <div class="wb-sec">说明</div>
          <p class="wb-fval wb-fs13 wb-m0" style="line-height: 1.7">道具为只读详情，由剧本资产提取自动生成。</p>
        </template>
      </template>
      <p v-else class="wb-notchosen">在画布中选择一个资产，这里会显示它的属性</p>
    </aside>
  </div>
</template>
