<template>
  <div class="pipe">
    <div class="sec">生产流程</div>
    <div
      v-for="(step, i) in steps"
      :key="step.key"
      :class="['pstep', step.state]"
    >
      <span class="pdot">
        <span v-if="step.state === 'done'">✓</span>
        <span v-else-if="step.state === 'locked'">🔒</span>
        <span v-else>{{ i + 1 }}</span>
      </span>
      <div class="pbody">
        <div class="prow">
          <span class="plabel">{{ step.label }}</span>
          <button
            v-if="step.tab"
            class="plink"
            title="前往查看"
            @click="$emit('navigate', step.tab)"
          >
            前往{{ step.tabLabel }} →
          </button>
        </div>

        <!-- Current step: the actionable one -->
        <button
          v-if="step.state === 'current'"
          class="btn pri pact"
          :disabled="busyKey !== null"
          @click="run(step)"
        >
          <span v-if="busyKey === step.key" class="spin"></span>
          {{ step.actionLabel }}
        </button>

        <!-- Locked step: explain the prerequisite -->
        <p v-else-if="step.state === 'locked'" class="phint">
          {{ step.lockHint }}
        </p>
        <p v-else class="pdone">{{ step.doneHint }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { ElMessage } from "element-plus";
import { workbenchApi } from "@/api";
import type { Episode } from "@/api/workbench";

const props = defineProps<{ episode: Episode }>();
const emit = defineEmits<{
  (e: "navigate", tab: "script" | "assets" | "board"): void;
  (e: "changed"): void;
}>();

const busyKey = ref<string | null>(null);

type Tab = "script" | "assets" | "board";
interface StepDef {
  key: string;
  label: string;
  tab: Tab;
  tabLabel: string;
  actionLabel: string;
  lockHint: string;
  doneHint: string;
  done: (e: Episode) => boolean;
  run: (id: string) => Promise<unknown>;
}

// The fixed production pipeline. `done` predicates mirror the backend's hard
// prerequisites so the stepper never enables a step the backend would reject.
const DEFS: StepDef[] = [
  {
    key: "script",
    label: "剧本",
    tab: "script",
    tabLabel: "剧本页",
    actionLabel: "生成剧本",
    lockHint: "",
    doneHint: "剧本已生成",
    done: (e) => e.scriptId != null,
    run: (id) => workbenchApi.generateScript(id),
  },
  {
    key: "assets",
    label: "角色 / 场景 / 道具",
    tab: "assets",
    tabLabel: "资产页",
    actionLabel: "提取资产",
    lockHint: "需先生成剧本",
    doneHint: "资产已提取",
    done: (e) => e.sceneLinkCount > 0 && e.characterLinkCount > 0,
    run: (id) => workbenchApi.extractAssets(id),
  },
  {
    key: "board",
    label: "分镜",
    tab: "board",
    tabLabel: "分镜页",
    actionLabel: "生成分镜",
    lockHint: "需先提取角色 / 场景资产",
    doneHint: "分镜已生成",
    done: (e) => e.storyboardCount > 0,
    run: (id) => workbenchApi.generateStoryboards(id),
  },
  {
    key: "frames",
    label: "镜头出图",
    tab: "board",
    tabLabel: "分镜页",
    actionLabel: "生成镜头图",
    lockHint: "需先生成分镜",
    doneHint: "首帧图已全部生成",
    done: (e) =>
      e.storyboardCount > 0 && e.firstFrameDoneCount >= e.storyboardCount,
    run: (id) => workbenchApi.generateEpisodeStoryboardFirstFrames(id),
  },
];

const steps = computed(() => {
  // The "current" step is the first not-yet-done one; earlier are done, later are locked.
  const firstPending = DEFS.findIndex((d) => !d.done(props.episode));
  return DEFS.map((d, i) => {
    const done = d.done(props.episode);
    const state: "done" | "current" | "locked" = done
      ? "done"
      : i === firstPending
        ? "current"
        : "locked";
    return { ...d, state };
  });
});

async function run(step: StepDef) {
  if (busyKey.value !== null) return;
  busyKey.value = step.key;
  try {
    await step.run(props.episode.id);
    ElMessage.success("已提交任务，可在任务中心查看进度");
    emit("changed");
  } finally {
    busyKey.value = null;
  }
}
</script>

<style scoped>
.pipe {
  margin-top: 4px;
}
.sec {
  font-size: 11px;
  font-weight: 600;
  color: #9a9da4;
  letter-spacing: 0.08em;
  margin: 20px 0 10px;
}
.pstep {
  display: flex;
  gap: 10px;
  padding-bottom: 14px;
  position: relative;
}
/* Connector line between step dots */
.pstep:not(:last-child)::before {
  content: "";
  position: absolute;
  left: 10px;
  top: 22px;
  bottom: 0;
  width: 1px;
  background: #e6e5e1;
}
.pdot {
  flex: none;
  width: 21px;
  height: 21px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  background: #f1f0ed;
  color: #9a9da4;
  z-index: 1;
}
.pstep.done .pdot {
  background: #1a9e5c;
  color: #fff;
}
.pstep.current .pdot {
  background: #cf6134;
  color: #fff;
}
.pbody {
  flex: 1;
  min-width: 0;
}
.prow {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 21px;
}
.plabel {
  font-size: 13px;
  font-weight: 600;
  color: #2a2d33;
}
.pstep.locked .plabel {
  color: #a9abb1;
}
.plink {
  margin-left: auto;
  border: 0;
  background: transparent;
  color: #b0663f;
  font-size: 11.5px;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
  font-family: inherit;
  white-space: nowrap;
}
.plink:hover {
  background: #f7ece5;
}
.pact {
  margin-top: 8px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.phint {
  font-size: 11.5px;
  color: #a9abb1;
  margin: 3px 0 0;
}
.pdone {
  font-size: 11.5px;
  color: #6b9e82;
  margin: 3px 0 0;
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
.btn.pri:hover:not(:disabled) {
  background: #bb5329;
}
.btn:disabled {
  opacity: 0.6;
  cursor: default;
}
.spin {
  width: 11px;
  height: 11px;
  border: 2px solid rgba(255, 255, 255, 0.5);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
