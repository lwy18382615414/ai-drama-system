<template>
  <div class="sf-shell">
    <aside class="sf-sidebar">
      <RouterLink to="/" class="sf-brand">
        <div class="sf-brand__mark">
          <n-icon :component="FilmOutline" />
        </div>
        <div>
          <div class="sf-brand__name">AI 短剧工作台</div>
          <div class="sf-brand__sub">StoryFrame Studio</div>
        </div>
      </RouterLink>

      <nav class="sf-nav">
        <RouterLink
          to="/"
          class="sf-nav__item"
          :class="{ 'is-active': route.name === 'projects' }"
        >
          <span class="sf-nav__icon"
            ><n-icon :component="FolderOpenOutline"
          /></span>
          全部项目
        </RouterLink>

        <template v-if="project">
          <div class="sf-nav__section">{{ project.title }}</div>
          <template v-for="item in nav" :key="item.label">
            <RouterLink
              v-if="item.to"
              :to="item.to"
              class="sf-nav__item"
              :class="{ 'is-active': isNavActive(item.to) }"
            >
              <span class="sf-nav__icon"
                ><n-icon :component="item.icon"
              /></span>
              {{ item.label }}
            </RouterLink>
            <div
              v-else
              class="sf-nav__item is-disabled"
              :title="item.disabledHint"
            >
              <span class="sf-nav__icon"
                ><n-icon :component="item.icon"
              /></span>
              {{ item.label }}
            </div>
          </template>
        </template>
        <template v-else>
          <div class="sf-nav__section">开始</div>
          <div class="sf-nav__item sf-faint">选择一个项目以查看工作流</div>
        </template>
      </nav>
    </aside>

    <div class="sf-main">
      <header class="sf-topbar">
        <div class="sf-breadcrumb">
          <RouterLink to="/">项目</RouterLink>
          <template v-if="project">
            <span class="sf-breadcrumb__sep">/</span>
            <RouterLink
              :to="{ name: 'project-overview', params: { id: project.id } }"
            >
              {{ project.title }}
            </RouterLink>
          </template>
          <template v-if="pageTitle">
            <span class="sf-breadcrumb__sep">/</span>
            <span class="sf-breadcrumb__current">{{ pageTitle }}</span>
          </template>
        </div>
      </header>

      <main class="sf-content">
        <div class="sf-content__inner">
          <RouterView />
        </div>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  RouterLink,
  RouterView,
  useRoute,
  type RouteLocationRaw,
} from "vue-router";
import {
  AlbumsOutline,
  BookOutline,
  DocumentTextOutline,
  FilmOutline,
  FolderOpenOutline,
  HomeOutline,
  ImageOutline,
  PeopleOutline,
} from "@vicons/ionicons5";
import { listEpisodes } from "@/api/episodes";
import { listProjectCharacters } from "@/api/assets";
import { useProject } from "@/composables/useProject";

const route = useRoute();
const { projectId, project } = useProject();

/** A representative episode so episode-scoped nav links have a target. */
const firstEpisodeId = ref<string | undefined>(undefined);
/** A representative character so the reference-image nav link has a target; hidden when the project has none yet. */
const firstCharacterId = ref<string | undefined>(undefined);

watch(
  projectId,
  async (pid) => {
    firstEpisodeId.value = undefined;
    firstCharacterId.value = undefined;
    if (!pid) return;

    const [episodes, characters] = await Promise.all([
      listEpisodes(pid),
      listProjectCharacters(pid),
    ]);
    firstEpisodeId.value = episodes[0]?.id;
    firstCharacterId.value = characters[0]?.id;
  },
  { immediate: true },
);

const nav = computed(() => {
  const pid = projectId.value;
  if (!pid) return [];
  const epId = firstEpisodeId.value;
  // Episode-scoped pages have no target until at least one episode exists;
  // such items carry a `disabledHint` instead of `to` and render grayed out.
  const items: Array<{
    icon: typeof HomeOutline;
    label: string;
    to?: RouteLocationRaw;
    disabledHint?: string;
  }> = [
    {
      icon: HomeOutline,
      label: "项目概览",
      to: { name: "project-overview", params: { id: pid } },
    },
    {
      icon: BookOutline,
      label: "小说与事件",
      to: { name: "novel", params: { id: pid } },
    },
    {
      icon: FilmOutline,
      label: "剧集规划",
      to: { name: "episodes", params: { id: pid } },
    },
    {
      icon: DocumentTextOutline,
      label: "剧本编辑",
      ...(epId
        ? { to: { name: "script", params: { id: pid, episodeId: epId } } }
        : { disabledHint: "请先规划剧集" }),
    },
    {
      icon: PeopleOutline,
      label: "角色/场景/道具",
      to: { name: "assets", params: { id: pid } },
    },
    {
      icon: AlbumsOutline,
      label: "分镜工作台",
      ...(epId
        ? { to: { name: "storyboards", params: { id: pid, episodeId: epId } } }
        : { disabledHint: "请先规划剧集" }),
    },
  ];

  if (firstCharacterId.value) {
    items.push({
      icon: ImageOutline,
      label: "角色参考图",
      to: {
        name: "character-image",
        params: { id: pid, characterId: firstCharacterId.value },
      },
    });
  }

  return items;
});

/**
 * Highlight a nav item only when the current route *is* its target route (by
 * name), rather than the default inclusive prefix match. This prevents siblings
 * that share a route (e.g. the episode-less fallback to `episodes`) from all
 * lighting up at once.
 */
function isNavActive(to: RouteLocationRaw): boolean {
  console.log("isNavActive", to, route.name);
  const name = typeof to === "object" && "name" in to ? to.name : undefined;
  return name != null && route.name === name;
}

const pageTitle = computed(
  () => (route.meta.title as string | undefined) ?? "",
);
</script>


