<template>
  <div class="list">
    <!-- Top bar -->
    <header class="lhead">
      <div class="lbrandgrp">
        <span class="logo">▶</span>
        <span class="lbrand">AI短剧 · 工作台</span>
      </div>
      <label class="search">
        <span>🔍</span>
        <input v-model="keyword" class="search__input" placeholder="搜索" />
      </label>
      <div class="hactions">
        <button class="hicon" title="通知">🔔</button>
        <button class="hicon" title="帮助">❓</button>
        <span class="avatar-c">我</span>
      </div>
    </header>

    <div class="lbody">
      <!-- Hero + stats -->
      <div class="hero">
        <div>
          <h1 class="htitle">
            欢迎回来,<br />开始你的短剧创作<span class="sun">✳</span>
          </h1>
          <p class="hsub">用 AI 激发灵感,让创作更简单高效</p>
        </div>
        <div class="stats">
          <div v-for="s in stats" :key="s.label" class="stat">
            <span class="sicon">{{ s.icon }}</span>
            <div>
              <div class="slab">{{ s.label }}</div>
              <div class="snum2">
                {{ s.num }}<span v-if="s.unit" class="sunit">{{ s.unit }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Projects section -->
      <div class="sectionwrap">
        <div class="swhead">
          <div>
            <h2 class="swtitle">我的项目</h2>
            <p class="swsub">{{ pjSub }}</p>
          </div>
          <div class="swright">
            <button class="newbtn" @click="openCreate">＋ 新建项目</button>
          </div>
        </div>

        <div v-loading="loading" class="pgrid">
          <button
            v-for="p in cards"
            :key="p.id"
            class="pcard"
            @click="goDetail(p.id)"
          >
            <div class="pcover" :style="{ background: p.cover }">
              <span v-if="p.recent" class="recent">最近</span>
            </div>
            <div class="pcbody">
              <div class="pctop">
                <span class="pcname">{{ p.title }}</span>
                <el-dropdown
                  trigger="click"
                  @command="(cmd: string) => onCardCommand(cmd, p)"
                >
                  <span class="pcedit" @click.stop>✎</span>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item command="open"
                        >进入项目</el-dropdown-item
                      >
                      <el-dropdown-item command="delete" divided
                        >删除项目</el-dropdown-item
                      >
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </div>
              <div class="pcmeta">{{ p.meta }}</div>
              <div class="tl">
                <div
                  v-for="stage in p.stages"
                  :key="stage.label"
                  :class="stage.cls"
                >
                  <span class="tldot"></span>
                  <span class="tllabel">{{ stage.label }}</span>
                  <span class="tlstat">{{ stage.stat }}</span>
                </div>
              </div>
              <div class="pcfoot">
                <span>{{ p.updated }}</span>
                <span class="go">进入项目 →</span>
              </div>
            </div>
          </button>
        </div>

        <el-empty
          v-if="!loading && projects.length === 0"
          description="还没有项目,点击右上角新建一个吧"
        />
      </div>
    </div>

    <!-- Create modal (paste novel / drop .txt·.epub, per 工作台原型) -->
    <CreateProjectModal
      v-if="createVisible"
      @close="createVisible = false"
      @created="onCreated"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import { projectApi } from "@/api";
import type { ProjectSummary } from "@/api/projects";
import CreateProjectModal from "./CreateProjectModal.vue";

const router = useRouter();

const projects = ref<ProjectSummary[]>([]);
const loading = ref(false);
const keyword = ref("");

async function load() {
  loading.value = true;
  try {
    const data = await projectApi.listProjects();
    projects.value = data.projects;
  } finally {
    loading.value = false;
  }
}

// ---- Hero stats: only aggregates the backend actually exposes (per CLAUDE.md,
// missing stats such as "进行中任务" / absolute image count are omitted). ----
const stats = computed(() => {
  const sum = (pick: (p: ProjectSummary) => number) =>
    projects.value.reduce((acc, p) => acc + pick(p), 0);
  return [
    { icon: "▦", label: "项目数", num: projects.value.length, unit: "" },
    { icon: "◧", label: "剧集", num: sum((p) => p.episodeCount), unit: "" },
    { icon: "✎", label: "剧本", num: sum((p) => p.scriptCount), unit: "" },
    { icon: "◆", label: "分镜", num: sum((p) => p.storyboardCount), unit: "" },
  ];
});

const pjSub = computed(
  () => `共 ${projects.value.length} 个项目,继续创作你的精彩故事`,
);

// ---- Project cards ----
const COVERS = [
  "linear-gradient(135deg,#3a4a6b 0%,#1f2740 100%)",
  "linear-gradient(135deg,#8a6d3b 0%,#4a3a22 100%)",
  "linear-gradient(135deg,#3d6b63 0%,#1f3a35 100%)",
  "linear-gradient(135deg,#6b3a4a 0%,#40202a 100%)",
  "linear-gradient(135deg,#4a3d6b 0%,#2a1f40 100%)",
];

function coverFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++)
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return COVERS[hash % COVERS.length];
}

type StageState = "done" | "run" | "pending";

function stageLabel(state: StageState): string {
  return state === "done" ? "✓ 已完成" : state === "run" ? "进行中" : "待开始";
}

function stagesFor(p: ProjectSummary) {
  const chapters: StageState = p.chapterCount > 0 ? "done" : "pending";
  const script: StageState =
    p.episodeCount > 0 && p.scriptCount >= p.episodeCount
      ? "done"
      : p.scriptCount > 0
        ? "run"
        : "pending";
  const board: StageState =
    p.episodeCount > 0 && p.storyboardEpisodeCount >= p.episodeCount
      ? "done"
      : p.storyboardCount > 0
        ? "run"
        : "pending";
  const image: StageState =
    p.imageCompletion >= 100
      ? "done"
      : p.imageCompletion > 0
        ? "run"
        : "pending";

  return [
    ["小说设定", chapters],
    ["脚本写作", script],
    ["分镜", board],
    ["出图", image],
  ].map(([label, state]) => ({
    label: label as string,
    cls: `tlnode ${state}`,
    stat: stageLabel(state as StageState),
  }));
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} 天前`;
  return new Date(iso).toLocaleDateString("zh-CN");
}

const cards = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  return projects.value
    .filter(
      (p) =>
        !kw ||
        p.title.toLowerCase().includes(kw) ||
        (p.genre ?? "").toLowerCase().includes(kw),
    )
    .map((p, index) => ({
      id: p.id,
      title: p.title,
      cover: coverFor(p.id),
      recent: index === 0 && !kw,
      meta: `${p.episodeCount} 集 · ${p.genre || "未分类"}`,
      updated: `更新于 ${relativeTime(p.updatedAt)}`,
      stages: stagesFor(p),
    }));
});

function goDetail(id: string) {
  router.push({ name: "project-detail", params: { projectId: id } });
}

async function onCardCommand(cmd: string, p: { id: string; title: string }) {
  if (cmd === "open") {
    goDetail(p.id);
    return;
  }
  if (cmd === "delete") {
    await ElMessageBox.confirm(
      `确认删除项目「${p.title}」？该操作不可恢复。`,
      "删除项目",
      {
        type: "warning",
        confirmButtonText: "删除",
        cancelButtonText: "取消",
      },
    );
    await projectApi.deleteProject(p.id);
    ElMessage.success("已删除");
    await load();
  }
}

// ---- Create ----
const createVisible = ref(false);

function openCreate() {
  createVisible.value = true;
}

function onCreated(projectId: string) {
  createVisible.value = false;
  goDetail(projectId);
}

onMounted(load);
</script>

<style scoped>
.list {
  min-height: 100vh;
  background: #f5f2ea;
  color: #1f2126;
  font-family:
    -apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei",
    system-ui, sans-serif;
}

/* Top bar */
.lhead {
  display: flex;
  align-items: center;
  padding: 0 34px;
  height: 66px;
  background: #f5f2ea;
  position: sticky;
  top: 0;
  z-index: 5;
}
.lbrandgrp {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 11px;
}
.logo {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  background: #cf6134;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 12px;
  padding-left: 2px;
}
.lbrand {
  font-size: 16px;
  font-weight: 700;
  color: #25211c;
  letter-spacing: -0.01em;
}
.search {
  flex: none;
  width: 460px;
  display: flex;
  align-items: center;
  gap: 9px;
  background: #fff;
  border: 1px solid #e7e0d3;
  border-radius: 11px;
  padding: 9px 14px;
  color: #a7a196;
  font-size: 13px;
  cursor: text;
}
.search__input {
  flex: 1;
  border: 0;
  outline: 0;
  background: transparent;
  font-size: 13px;
  color: #25211c;
  font-family: inherit;
}
.search__input::placeholder {
  color: #a7a196;
}
.search .kbd {
  font-size: 11px;
  color: #b3ab9c;
  border: 1px solid #e7e0d3;
  border-radius: 5px;
  padding: 1px 6px;
  background: #faf8f3;
}
.hactions {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}
.hicon {
  border: 0;
  background: transparent;
  font-size: 15px;
  color: #8f887a;
  cursor: pointer;
  width: 36px;
  height: 36px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.hicon:hover {
  background: #ece5d8;
}
.avatar-c {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: linear-gradient(135deg, #c98a5e, #8a5a38);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  margin-left: 4px;
}
.caret2 {
  color: #a7a196;
  font-size: 11px;
}

/* Body */
.lbody {
  max-width: 1240px;
  margin: 0 auto;
  padding: 32px 44px 64px;
}
.hero {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 44px;
  margin-bottom: 28px;
  flex-wrap: wrap;
}
.htitle {
  font-size: 33px;
  line-height: 1.28;
  font-weight: 800;
  color: #221e18;
  margin: 0;
  letter-spacing: -0.01em;
}
.sun {
  color: #e0803a;
  font-size: 19px;
  margin-left: 9px;
}
.hsub {
  font-size: 14px;
  color: #9b9484;
  margin: 15px 0 0;
}
.stats {
  display: flex;
  gap: 13px;
  flex-wrap: wrap;
}
.stat {
  background: #fbf9f3;
  border: 1px solid #ece5d8;
  border-radius: 14px;
  padding: 15px 17px;
  display: flex;
  gap: 12px;
  align-items: center;
  min-width: 132px;
}
.sicon {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: #f0e9dc;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  color: #b3855c;
  flex: none;
}
.slab {
  font-size: 12px;
  color: #9b9484;
}
.snum2 {
  font-size: 23px;
  font-weight: 800;
  color: #221e18;
  display: flex;
  align-items: baseline;
  gap: 5px;
  line-height: 1.15;
  margin-top: 2px;
}
.sunit {
  font-size: 11.5px;
  color: #a7a196;
  font-weight: 500;
}

/* Section */
.sectionwrap {
  background: #faf8f1;
  border: 1px solid #e9e2d4;
  border-radius: 18px;
  padding: 26px 28px 30px;
}
.swhead {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 22px;
}
.swtitle {
  font-size: 19px;
  font-weight: 700;
  color: #221e18;
  margin: 0;
}
.swsub {
  font-size: 13px;
  color: #9b9484;
  margin: 6px 0 0;
}
.swright {
  display: flex;
  gap: 12px;
  align-items: center;
}
.newbtn {
  border: 0;
  background: #2b2620;
  color: #fff;
  border-radius: 9px;
  padding: 10px 17px;
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 7px;
}
.newbtn:hover {
  background: #423a30;
}

/* Grid */
.pgrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(430px, 1fr));
  gap: 22px;
}
.pcard {
  background: #fff;
  border: 1px solid #ece5d8;
  border-radius: 14px;
  overflow: hidden;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  padding: 0;
  transition:
    box-shadow 0.16s,
    transform 0.16s,
    border-color 0.16s;
  display: flex;
  flex-direction: column;
}
.pcard:hover {
  box-shadow: 0 10px 26px rgba(60, 45, 25, 0.1);
  transform: translateY(-2px);
  border-color: #e0d7c5;
}
.pcover {
  height: 150px;
  position: relative;
  display: flex;
  align-items: flex-start;
  padding: 13px 14px;
}
.recent {
  background: rgba(22, 19, 15, 0.6);
  color: #fff;
  font-size: 11px;
  padding: 4px 11px;
  border-radius: 8px;
  backdrop-filter: blur(4px);
  font-weight: 500;
}
.pcbody {
  padding: 16px 18px 18px;
  display: flex;
  flex-direction: column;
}
.pctop {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.pcname {
  font-size: 16px;
  font-weight: 700;
  color: #221e18;
  flex: 1;
}
.pcedit {
  color: #c3bcac;
  cursor: pointer;
  font-size: 14px;
  padding: 2px;
  outline: none;
}
.pcedit:hover {
  color: #8f887a;
}
.pcmeta {
  font-size: 12.5px;
  color: #9b9484;
  margin: 4px 0 20px;
}
.tl {
  position: relative;
  display: flex;
  margin-bottom: 4px;
}
.tl::before {
  content: "";
  position: absolute;
  left: 12.5%;
  right: 12.5%;
  top: 6px;
  height: 2px;
  background: #e8e0d1;
}
.tlnode {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 9px;
  position: relative;
  z-index: 1;
}
.tldot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  border: 2px solid #d8d0c0;
  box-sizing: border-box;
}
.tlnode.done .tldot {
  background: #4a9e6a;
  border-color: #4a9e6a;
}
.tlnode.run .tldot {
  background: #cf6134;
  border-color: #cf6134;
  box-shadow: 0 0 0 4px rgba(207, 97, 52, 0.16);
}
.tllabel {
  font-size: 12.5px;
  color: #4a4438;
  font-weight: 500;
}
.tlstat {
  font-size: 11px;
  color: #b0a99a;
}
.tlnode.done .tlstat {
  color: #3f9564;
}
.tlnode.run .tlstat {
  color: #cf6134;
  font-weight: 600;
}
.pcfoot {
  display: flex;
  align-items: center;
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid #f1ece1;
  font-size: 12px;
  color: #a29b8c;
}
.pcfoot .go {
  margin-left: auto;
  border: 1px solid #e2daca;
  background: #fff;
  border-radius: 8px;
  padding: 6px 13px;
  font-size: 12.5px;
  font-weight: 600;
  color: #3f3a30;
  display: flex;
  align-items: center;
  gap: 6px;
}

/* New-project card */
.ncard {
  border: 1.5px dashed #d8d0c0;
  background: transparent;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 11px;
  min-height: 100%;
  padding: 40px 30px;
  text-align: center;
  transition: border-color 0.16s;
}
.ncard:hover {
  border-color: #cf6134;
  transform: none;
  box-shadow: none;
}
.nplus {
  width: 60px;
  height: 60px;
  border-radius: 15px;
  background: #f0e9dc;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  font-weight: 300;
  color: #b3855c;
  line-height: 1;
}
.ntitle {
  font-size: 16px;
  font-weight: 700;
  color: #221e18;
}
.nsub {
  font-size: 12.5px;
  color: #9b9484;
  max-width: 230px;
  line-height: 1.6;
}
.nbtn {
  margin-top: 4px;
  border: 0;
  background: #2b2620;
  color: #fff;
  border-radius: 9px;
  padding: 9px 16px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 7px;
}
</style>
