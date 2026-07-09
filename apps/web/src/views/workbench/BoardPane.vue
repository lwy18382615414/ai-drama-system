<template>
  <div :class="['pane', inspOn ? '' : 'noinsp']">
    <!-- Episodes tree -->
    <aside class="tree">
      <div class="thead">剧集</div>
      <button
        v-for="(e, i) in episodes"
        :key="e.id"
        :class="['trow', i === activeIdx ? 'on' : '']"
        @click="selectEpisode(i)"
      >
        {{ e.title || `第${e.episodeNo}集` }}
      </button>
      <div
        v-if="!loading && episodes.length === 0"
        class="thead"
        style="padding-top: 8px"
      >
        暂无剧集
      </div>
    </aside>

    <!-- Canvas -->
    <div class="canvas">
      <div v-if="boardLoading" class="empty">
        <span class="spin" style="margin: 0; width: 18px; height: 18px"></span>
        <span class="emptyti">加载分镜…</span>
      </div>
      <template v-else-if="shots.length">
        <div class="boardft">
          <template v-if="selecting">
            <span>已选 {{ selectedIds.size }} / {{ shots.length }}</span>
            <button class="btn" @click="selectAll">全选</button>
            <button
              class="btn pri"
              style="margin-left: auto"
              :disabled="busy || selectedIds.size === 0"
              @click="generateSelected"
            >
              生成选中({{ selectedIds.size }})
            </button>
            <button class="btn" :disabled="busy" @click="toggleSelecting">
              退出多选
            </button>
          </template>
          <template v-else>
            <span>{{ boardSummary }}</span>
            <button
              class="btn pri"
              style="margin-left: auto"
              :disabled="busy || missingCount === 0"
              @click="generateMissing"
            >
              生成全部缺失({{ missingCount }})
            </button>
            <button class="btn" :disabled="busy" @click="toggleSelecting">
              多选
            </button>
            <button class="btn" :disabled="busy" @click="regenerate">
              重新生成分镜
            </button>
          </template>
        </div>
        <div class="shotgrid">
          <button
            v-for="(s, i) in shots"
            :key="s.id"
            :class="[
              'shot',
              !selecting && i === activeShotIdx ? 'on' : '',
              selecting && selectedIds.has(s.id) ? 'sel' : '',
            ]"
            @click="selecting ? toggleSelect(s.id) : (activeShotIdx = i)"
          >
            <span v-if="selecting" class="selbox">{{
              selectedIds.has(s.id) ? "☑" : "☐"
            }}</span>
            <div
              v-if="s.firstFrameImageUrl"
              class="thumb"
              :style="{
                backgroundImage: `url(${assetUrl(s.firstFrameImageUrl)})`,
              }"
            ></div>
            <div v-else-if="isGenerating(s)" class="thumb gen">
              <span class="spin"></span>生成中
            </div>
            <div v-else class="thumb none">待出图</div>
            <div class="shotft">
              <span class="shotno mono">{{
                String(s.shotNo).padStart(2, "0")
              }}</span>
              <span>{{ s.shotType }}</span>
              <span style="margin-left: auto">{{
                s.firstFrameImageUrl ? "✓" : ""
              }}</span>
            </div>
          </button>
        </div>
      </template>
      <div v-else-if="activeEpisode" class="empty">
        <span class="emptyti">{{ episodeTitle }} 尚无分镜</span>
        <span style="max-width: 340px; line-height: 1.7"
          >需先生成本集剧本,再由剧本拆解分镜</span
        >
        <button class="btn pri" :disabled="busy" @click="regenerate">
          ✨ 生成分镜
        </button>
      </div>
      <div v-else class="empty"><span class="emptyti">选择左侧剧集</span></div>
    </div>

    <!-- Inspector -->
    <aside v-if="inspOn" class="insp">
      <template v-if="activeShot">
        <p class="ihead">
          镜头 {{ String(activeShot.shotNo).padStart(2, "0") }}
        </p>
        <p class="ititle">{{ activeShot.action }}</p>
        <div style="display: flex; gap: 8px; margin: 8px 0">
          <span class="chip">{{ activeShot.shotType }}</span>
          <span v-if="activeShot.cameraMovement" class="chip">{{
            activeShot.cameraMovement
          }}</span>
        </div>
        <el-image
          v-if="activeShot.firstFrameImageUrl"
          class="frame"
          :src="assetUrl(activeShot.firstFrameImageUrl)"
          :preview-src-list="previewList"
          :initial-index="previewIndex"
          fit="cover"
          preview-teleported
        />
        <div v-else class="frame thumb none">
          {{ isGenerating(activeShot) ? "生成中" : "待出图" }}
        </div>
        <div class="frow">
          <span class="flabel">时长</span
          ><span class="fval">{{ activeShot.duration }}s</span>
        </div>
        <div class="frow">
          <span class="flabel">机位</span
          ><span class="fval">{{ activeShot.cameraAngle || "—" }}</span>
        </div>
        <div class="frow">
          <span class="flabel">情绪</span
          ><span class="fval">{{ activeShot.emotion || "—" }}</span>
        </div>
        <div class="frow">
          <span class="flabel">状态</span>
          <span class="fval">
            <span :class="['chip', activeShot.firstFrameImageUrl ? 'ok' : '']">
              {{ activeShot.firstFrameImageUrl ? "已出图" : "待出图" }}
            </span>
          </span>
        </div>
        <div class="sec">image_prompt</div>
        <div class="pblock mono">{{ activeShot.imagePrompt }}</div>
        <div class="sec">操作</div>
        <button class="btn blk pri" :disabled="busy" @click="generateFrame">
          生成本镜首帧图
        </button>
      </template>
      <p
        v-else
        class="fval"
        style="color: #9a9da4; padding: 20px 0; text-align: center"
      >
        生成分镜后,选中镜头查看属性
      </p>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, toRef, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { assetUrl, workbenchApi } from "@/api";
import type { Episode, Storyboard } from "@/api/workbench";
import { useTaskStream } from "@/composables/useTaskStream";

const props = defineProps<{ projectId: string; inspOn: boolean }>();

const episodes = ref<Episode[]>([]);
const loading = ref(false);
const activeIdx = ref(0);

const shots = ref<Storyboard[]>([]);
const boardLoading = ref(false);
const activeShotIdx = ref(0);
const busy = ref(false);

// Multi-select batch mode: while on, clicking a shot toggles its checkbox
// instead of opening it in the inspector.
const selecting = ref(false);
const selectedIds = ref<Set<string>>(new Set());

// Live task stream (shared per-project via the hook registry) lets shots
// mid-generation show a spinner.
const { tasks } = useTaskStream(toRef(props, "projectId"));

const activeEpisode = computed(() => episodes.value[activeIdx.value] ?? null);
const episodeTitle = computed(
  () =>
    activeEpisode.value?.title || `第${activeEpisode.value?.episodeNo ?? ""}集`,
);
const activeShot = computed(() => shots.value[activeShotIdx.value] ?? null);

// Whole-pane preview: arrow through every shot in this episode that has a first
// frame, in shot order. Imageless shots are excluded, so the selected shot's
// position is looked up by its resolved URL.
const previewList = computed(() =>
  shots.value
    .filter((s) => s.firstFrameImageUrl)
    .map((s) => assetUrl(s.firstFrameImageUrl!)),
);
const previewIndex = computed(() => {
  const url = activeShot.value?.firstFrameImageUrl;
  if (!url) return 0;
  return Math.max(0, previewList.value.indexOf(assetUrl(url)));
});

const boardSummary = computed(() => {
  const total = shots.value.length;
  const done = shots.value.filter((s) => s.firstFrameImageUrl).length;
  return `${total} 个镜头 · ${done} 已出图 · ${total - done} 待出图`;
});

// Shots eligible for the one-click "generate all missing": no image yet and not
// already generating (so the count matches what the batch will actually enqueue).
const missingCount = computed(
  () =>
    shots.value.filter((s) => !s.firstFrameImageUrl && !isGenerating(s)).length,
);

// Reloads shots when an image task for this episode completes, so freshly generated
// thumbnails appear without switching episodes. Index-based selection stays valid
// because batch generation never changes the shot count.
const completedFrameCount = computed(
  () =>
    tasks.value.filter(
      (t) =>
        t.taskType === "image_generation" &&
        t.storyboardId != null &&
        t.episodeId === activeEpisode.value?.id &&
        t.status === "completed",
    ).length,
);

function isGenerating(shot: Storyboard): boolean {
  return tasks.value.some(
    (t) =>
      t.storyboardId === shot.id &&
      (t.status === "pending" || t.status === "running"),
  );
}

function toggleSelecting() {
  selecting.value = !selecting.value;
  if (!selecting.value) selectedIds.value = new Set();
}

function toggleSelect(id: string) {
  const next = new Set(selectedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectedIds.value = next;
}

function selectAll() {
  selectedIds.value = new Set(shots.value.map((s) => s.id));
}

async function reloadShots() {
  const ep = activeEpisode.value;
  if (!ep) return;
  const { storyboards } = await workbenchApi.getEpisodeStoryboards(ep.id);
  shots.value = storyboards;
}

// Generate every shot still missing a first frame (skips existing, force=false).
async function generateMissing() {
  const ep = activeEpisode.value;
  if (!ep) return;
  busy.value = true;
  try {
    const res = await workbenchApi.generateEpisodeStoryboardFirstFrames(ep.id);
    ElMessage.success(
      `已排队 ${res.queued.length} 个,跳过 ${res.skipped.length} 个`,
    );
  } finally {
    busy.value = false;
  }
}

// Regenerate the selected shots (force=true — overwrites existing images).
async function generateSelected() {
  const ep = activeEpisode.value;
  if (!ep || selectedIds.value.size === 0) return;
  const ids = [...selectedIds.value];
  const withImage = ids.filter(
    (id) => shots.value.find((s) => s.id === id)?.firstFrameImageUrl,
  ).length;
  try {
    await ElMessageBox.confirm(
      withImage > 0
        ? `将为选中的 ${ids.length} 个镜头生成首帧,其中 ${withImage} 个已出图将被覆盖。继续?`
        : `将为选中的 ${ids.length} 个镜头生成首帧。继续?`,
      "批量生成首帧",
      { type: "warning", confirmButtonText: "生成", cancelButtonText: "取消" },
    );
  } catch {
    return;
  }
  busy.value = true;
  try {
    const res = await workbenchApi.generateEpisodeStoryboardFirstFrames(ep.id, {
      storyboardIds: ids,
      force: true,
    });
    ElMessage.success(
      `已排队 ${res.queued.length} 个,跳过 ${res.skipped.length} 个`,
    );
    toggleSelecting();
  } finally {
    busy.value = false;
  }
}

async function loadEpisodes() {
  loading.value = true;
  try {
    const { episodes: rows } = await workbenchApi.getEpisodes(props.projectId);
    episodes.value = rows;
    if (rows.length) await selectEpisode(0);
  } finally {
    loading.value = false;
  }
}

async function selectEpisode(i: number) {
  activeIdx.value = i;
  activeShotIdx.value = 0;
  selecting.value = false;
  selectedIds.value = new Set();
  const ep = episodes.value[i];
  if (!ep) return;
  boardLoading.value = true;
  shots.value = [];
  try {
    const { storyboards } = await workbenchApi.getEpisodeStoryboards(ep.id);
    shots.value = storyboards;
  } finally {
    boardLoading.value = false;
  }
}

async function regenerate() {
  const ep = activeEpisode.value;
  if (!ep) return;
  busy.value = true;
  try {
    await workbenchApi.generateStoryboards(ep.id);
    ElMessage.success("已提交分镜生成任务,可在任务中心查看进度");
  } finally {
    busy.value = false;
  }
}

async function generateFrame() {
  const shot = activeShot.value;
  if (!shot) return;
  busy.value = true;
  try {
    await workbenchApi.generateStoryboardFirstFrame(shot.id);
    ElMessage.success("已提交首帧图生成任务");
  } finally {
    busy.value = false;
  }
}

watch(completedFrameCount, (n, prev) => {
  if (n > (prev ?? 0)) void reloadShots();
});

watch(() => props.projectId, loadEpisodes, { immediate: true });
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
.btn:hover {
  border-color: #c7c5bf;
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
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
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

/* Board mode */
.shotgrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(196px, 1fr));
  gap: 14px;
  padding: 24px 26px 10px;
}
.shot {
  position: relative;
  background: #fff;
  border: 1px solid #e8e7e3;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  padding: 0;
  text-align: left;
  font-family: inherit;
}
.shot.on {
  border-color: #cf6134;
  box-shadow: 0 0 0 1px #cf6134;
}
.shot.sel {
  border-color: #cf6134;
  box-shadow: 0 0 0 1px #cf6134;
}
.selbox {
  position: absolute;
  top: 6px;
  left: 6px;
  z-index: 1;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18);
  font-size: 15px;
  line-height: 1;
  color: #cf6134;
}
.thumb {
  aspect-ratio: 16 / 9;
  position: relative;
  background-size: cover;
  background-position: center;
}
.frame {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 8px;
  overflow: hidden;
  margin: 10px 0 4px;
  background: #000;
}
/* el-image variant: whole frame is the click-to-preview target */
.el-image.frame {
  cursor: zoom-in;
}
.thumb.none {
  background: #fafaf8;
  border-bottom: 1px dashed #e2e1dc;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #b4b6bc;
  font-size: 11px;
}
.thumb.gen {
  background: #fbf2ee;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  justify-content: center;
  color: #a4432f;
  font-size: 11px;
}
.thumb.gen .spin {
  margin: 0;
}
.shotft {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 11px;
  font-size: 11.5px;
  color: #5c5f66;
}
.shotno {
  font-weight: 700;
  color: #1f2126;
}
.boardft {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 26px;
  font-size: 12.5px;
  color: #8a8d94;
  background: #fff;
  border-bottom: 1px solid #ececec;
}
</style>
