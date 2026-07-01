<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import {
  listProjectCharacters,
  listProjectProps,
  listProjectScenes,
  type Character,
  type Prop,
  type Scene,
} from "@/api/assets";
import { getApiErrorMessage } from "@/api/client";
import { useProject } from "@/composables/useProject";
import PipelineSteps from "@/components/PipelineSteps.vue";
import PanelCard from "@/components/PanelCard.vue";
import MockButton from "@/components/MockButton.vue";

const message = useMessage();
const { projectId } = useProject();

const tab = ref<"characters" | "scenes" | "props">("characters");
const loading = ref(false);

const projectCharacters = ref<Character[]>([]);
const projectScenes = ref<Scene[]>([]);
const projectProps = ref<Prop[]>([]);

async function loadAssets() {
  if (!projectId.value) return;
  loading.value = true;
  try {
    const [characters, scenes, props] = await Promise.all([
      listProjectCharacters(projectId.value),
      listProjectScenes(projectId.value),
      listProjectProps(projectId.value),
    ]);
    projectCharacters.value = characters;
    projectScenes.value = scenes;
    projectProps.value = props;
  } catch (error) {
    message.error(getApiErrorMessage(error));
  } finally {
    loading.value = false;
  }
}

onMounted(loadAssets);
watch(projectId, loadAssets);
</script>

<template>
  <div>
    <div class="sf-page-head">
      <div>
        <h1 class="sf-page-title">角色 / 场景 / 道具</h1>
        <p class="sf-page-desc">ExtractAgent 从剧本中提取的可复用生产资产。</p>
      </div>
      <MockButton
        label="重新提取资产"
        variant="primary"
        icon="🔁"
        hint="需先在剧集规划页选择 episode，本页暂未接入"
      />
    </div>

    <PipelineSteps active-key="assets" />

    <n-tabs v-model:value="tab" type="line" animated class="sf-mb-16">
      <n-tab name="characters">角色 · {{ projectCharacters.length }}</n-tab>
      <n-tab name="scenes">场景 · {{ projectScenes.length }}</n-tab>
      <n-tab name="props">道具 · {{ projectProps.length }}</n-tab>
    </n-tabs>

    <n-spin :show="loading">
      <!-- Characters -->
      <div v-if="tab === 'characters'" class="sf-grid sf-grid--cards">
        <PanelCard v-for="ch in projectCharacters" :key="ch.id">
          <div class="sf-row" style="gap: 14px; align-items: flex-start">
            <div class="sf-thumb" style="width: 84px; flex-shrink: 0">
              <span v-if="ch.referenceImageUrl">🖼️</span>
              <span v-else>无图</span>
            </div>
            <div style="min-width: 0">
              <div class="sf-row sf-row--between sf-mb-8">
                <h3 class="sf-card__title">{{ ch.name }}</h3>
                <span class="sf-tag">{{ ch.role }}</span>
              </div>
              <p class="sf-muted" style="font-size: 12.5px">
                {{ ch.appearance }}
              </p>
              <p class="sf-faint" style="font-size: 12px">
                {{ ch.personality }}
              </p>
              <RouterLink
                :to="{
                  name: 'character-image',
                  params: { id: projectId, characterId: ch.id },
                }"
                class="sf-mt-8"
                style="display: inline-block"
              >
                <MockButton
                  :label="ch.referenceImageUrl ? '查看参考图' : '生成参考图'"
                  size="sm"
                  icon="🖼️"
                />
              </RouterLink>
            </div>
          </div>
        </PanelCard>
      </div>

      <!-- Scenes -->
      <div v-else-if="tab === 'scenes'" class="sf-grid sf-grid--cards">
        <PanelCard v-for="sc in projectScenes" :key="sc.id" :title="sc.name">
          <template #actions
            ><span class="sf-tag">{{
              sc.locationType ?? sc.visualStyle
            }}</span></template
          >
          <div class="sf-thumb sf-thumb--wide sf-mb-8">🏞️</div>
          <p class="sf-muted">{{ sc.description }}</p>
        </PanelCard>
      </div>

      <!-- Props -->
      <div v-else class="sf-grid sf-grid--cards">
        <PanelCard v-for="pr in projectProps" :key="pr.id" :title="pr.name">
          <p class="sf-muted">{{ pr.description }}</p>
        </PanelCard>
      </div>
    </n-spin>
  </div>
</template>
