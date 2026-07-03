import { computed, reactive, type ComputedRef } from 'vue'
import {
  getProject,
  getProjectChapters,
  type NovelChapter,
  type ProjectDetail,
} from '@/api/projects'
import { extractEvents, getChapterEvents } from '@/api/events'
import {
  getEpisodeEvents,
  listEpisodes,
  planEpisodes,
  type Episode,
  type EpisodeEventLink,
  type NovelEvent,
} from '@/api/episodes'
import { generateScript, getEpisodeScript, updateScript, type Script } from '@/api/scripts'
import {
  generateStoryboards,
  getEpisodeStoryboards,
  generateEpisodeStoryboardFirstFrames,
  generateStoryboardFirstFrame,
  type Storyboard,
} from '@/api/storyboards'
import {
  extractAssets,
  getEpisodeAssets,
  listProjectCharacters,
  listProjectProps,
  listProjectScenes,
  generateSceneImage,
  type Character,
  type Prop,
  type Scene,
} from '@/api/assets'
import { generateCharacterImage } from '@/api/characters'
import { getApiErrorMessage } from '@/api/client'
import { useTaskCenter, type RegisterTaskOptions } from '@/store/taskCenter'

export type Mode = 'novel' | 'script' | 'board' | 'assets'
export type ModeStatus = 'none' | 'ok' | 'run' | 'warn'

export interface GuideInfo {
  kind: 'next' | 'fail' | 'done'
  text: string
  ctaLabel?: string
  action?: () => void
  quickLabel?: string
  quickAction?: () => void
  /** Where the CTA should navigate before/alongside firing `action` — the "one click = navigate + act" rule. */
  target?: { mode: Mode; chapterId?: string; episodeId?: string }
  failedTask?: { label: string; kind?: string; scope?: string }
}

interface EpisodeAssetState {
  characters: Character[]
  scenes: Scene[]
  props: Prop[]
}

/**
 * Owns all server data for one project's workbench: the four modes read from
 * this shared cache instead of fetching independently, so switching modes
 * never loses context and the guide bar can see the whole project at once.
 */
export function createWorkbenchStore(projectId: string) {
  const message = useMessage()
  const taskCenterRaw = useTaskCenter()
  // Every task started from this store belongs to this project — tag it automatically, and
  // refresh the project's aggregate stage stats (event/episode/script counts etc.) whenever one
  // finishes, since those live on `state.project` and nothing else invalidates them.
  const taskCenter = {
    ...taskCenterRaw,
    register: (taskId: string, opts: RegisterTaskOptions) =>
      taskCenterRaw.register(taskId, {
        ...opts,
        projectId,
        onDone: () => {
          opts.onDone?.()
          void reloadProject()
        },
        onFailed: (msg: string | null) => {
          opts.onFailed?.(msg)
          void reloadProject()
        },
      }),
  }

  const state = reactive({
    loading: true,
    project: null as ProjectDetail | null,
    chapters: [] as NovelChapter[],
    eventsByChapter: new Map<string, NovelEvent[]>(),
    episodes: [] as Episode[],
    scriptsByEpisode: new Map<string, Script | null>(),
    sourceEventsByEpisode: new Map<string, EpisodeEventLink[]>(),
    assetsByEpisode: new Map<string, EpisodeAssetState>(),
    storyboardsByEpisode: new Map<string, Storyboard[]>(),
    characters: [] as Character[],
    scenes: [] as Scene[],
    props: [] as Prop[],
  })

  async function reloadProject() {
    state.project = await getProject(projectId)
  }

  async function reloadChapters() {
    state.chapters = await getProjectChapters(projectId)
    const rows = await Promise.all(
      state.chapters.map(async (c) => [c.id, await getChapterEvents(c.id)] as const),
    )
    state.eventsByChapter = new Map(rows)
  }

  async function reloadEpisodes() {
    state.episodes = await listEpisodes(projectId)
    const withScript = state.episodes.filter((e) => e.scriptId)

    const [assetRows, storyboardRows] = await Promise.all([
      Promise.all(
        withScript.map(async (e) => [e.id, await getEpisodeAssets(e.id)] as const),
      ),
      Promise.all(
        withScript.map(async (e) => [e.id, (await getEpisodeStoryboards(e.id)).storyboards] as const),
      ),
    ])
    state.assetsByEpisode = new Map(assetRows.map(([id, a]) => [id, a]))
    state.storyboardsByEpisode = new Map(storyboardRows)
  }

  async function reloadAssetLibrary() {
    const [characters, scenes, props] = await Promise.all([
      listProjectCharacters(projectId),
      listProjectScenes(projectId),
      listProjectProps(projectId),
    ])
    state.characters = characters
    state.scenes = scenes
    state.props = props
  }

  async function refreshAll() {
    state.loading = true
    try {
      await Promise.all([reloadProject(), reloadChapters(), reloadAssetLibrary()])
      await reloadEpisodes()
    } catch (error) {
      message.error(getApiErrorMessage(error))
    } finally {
      state.loading = false
    }
  }

  async function loadScriptFor(episodeId: string) {
    if (state.scriptsByEpisode.has(episodeId)) return
    try {
      const script = await getEpisodeScript(episodeId)
      state.scriptsByEpisode.set(episodeId, script)
    } catch (error) {
      message.error(getApiErrorMessage(error))
    }
  }

  async function loadSourceEventsFor(episodeId: string) {
    if (state.sourceEventsByEpisode.has(episodeId)) return
    try {
      const { events } = await getEpisodeEvents(episodeId)
      state.sourceEventsByEpisode.set(episodeId, events)
    } catch {
      state.sourceEventsByEpisode.set(episodeId, [])
    }
  }

  // ---------------------------------------------------------------- actions

  function runExtractEvents(chapterId: string) {
    const chapter = state.chapters.find((c) => c.id === chapterId)
    extractEvents(projectId, chapterId)
      .then(({ taskId }) => {
        taskCenter.register(taskId, {
          label: `事件提取 · ${chapter?.title ?? '章节'}`,
          scope: chapterId,
          kind: 'event_extraction',
          onDone: async () => {
            const events = await getChapterEvents(chapterId)
            state.eventsByChapter.set(chapterId, events)
            message.success(`「${chapter?.title ?? ''}」事件提取完成`)
          },
          onFailed: (msg) => message.error(msg ?? '事件提取失败'),
        })
      })
      .catch((error) => message.error(getApiErrorMessage(error)))
  }

  function runPlanEpisodes() {
    planEpisodes(projectId)
      .then(({ taskId }) => {
        taskCenter.register(taskId, {
          label: '剧集规划',
          kind: 'episode_planning',
          onDone: async () => {
            await reloadEpisodes()
            message.success('剧集规划完成')
          },
          onFailed: (msg) => message.error(msg ?? '剧集规划失败'),
        })
      })
      .catch((error) => message.error(getApiErrorMessage(error)))
  }

  function runGenerateScript(episodeId: string, opts?: { force?: boolean }) {
    const ep = state.episodes.find((e) => e.id === episodeId)
    generateScript(episodeId, opts)
      .then(({ taskId }) => {
        taskCenter.register(taskId, {
          label: `剧本生成 · 第 ${ep?.episodeNo ?? '?'} 集`,
          scope: episodeId,
          kind: 'script_generation',
          onDone: async () => {
            state.scriptsByEpisode.delete(episodeId)
            await Promise.all([reloadEpisodes(), loadScriptFor(episodeId)])
            message.success(`第 ${ep?.episodeNo ?? ''} 集剧本生成完成`)
          },
          onFailed: (msg) => message.error(msg ?? '剧本生成失败'),
        })
      })
      .catch((error) => message.error(getApiErrorMessage(error)))
  }

  async function saveScript(scriptId: string, content: string) {
    const script = await updateScript(scriptId, { content })
    for (const [epId, s] of state.scriptsByEpisode) {
      if (s?.id === scriptId) state.scriptsByEpisode.set(epId, script)
    }
    return script
  }

  function runExtractAssets(episodeId: string, opts?: { force?: boolean }) {
    const ep = state.episodes.find((e) => e.id === episodeId)
    extractAssets(episodeId, opts)
      .then(({ taskId }) => {
        taskCenter.register(taskId, {
          label: `资产提取 · 第 ${ep?.episodeNo ?? '?'} 集`,
          scope: episodeId,
          kind: 'asset_extraction',
          onDone: async () => {
            const assets = await getEpisodeAssets(episodeId)
            state.assetsByEpisode.set(episodeId, assets)
            await reloadAssetLibrary()
            message.success(`第 ${ep?.episodeNo ?? ''} 集资产提取完成`)
          },
          onFailed: (msg) => message.error(msg ?? '资产提取失败'),
        })
      })
      .catch((error) => message.error(getApiErrorMessage(error)))
  }

  function runGenerateStoryboards(episodeId: string, opts?: { force?: boolean }) {
    const ep = state.episodes.find((e) => e.id === episodeId)
    generateStoryboards(episodeId, opts)
      .then(({ taskId }) => {
        taskCenter.register(taskId, {
          label: `分镜生成 · 第 ${ep?.episodeNo ?? '?'} 集`,
          scope: episodeId,
          kind: 'storyboard_generation',
          onDone: async () => {
            const { storyboards } = await getEpisodeStoryboards(episodeId)
            state.storyboardsByEpisode.set(episodeId, storyboards)
            message.success(`第 ${ep?.episodeNo ?? ''} 集分镜生成完成`)
          },
          onFailed: (msg) => message.error(msg ?? '分镜生成失败'),
        })
      })
      .catch((error) => message.error(getApiErrorMessage(error)))
  }

  function runGenerateStoryboardFirstFrame(storyboardId: string, episodeId: string, opts?: { force?: boolean }) {
    generateStoryboardFirstFrame(storyboardId, opts)
      .then(({ taskId }) => {
        taskCenter.register(taskId, {
          label: '首帧图生成',
          scope: storyboardId,
          kind: 'image_generation',
          onDone: async () => {
            const { storyboards } = await getEpisodeStoryboards(episodeId)
            state.storyboardsByEpisode.set(episodeId, storyboards)
          },
          onFailed: (msg) => message.error(msg ?? '首帧图生成失败'),
        })
      })
      .catch((error) => message.error(getApiErrorMessage(error)))
  }

  const batchGeneratingEpisodes = reactive(new Set<string>())

  async function runBatchGenerateFirstFrames(episodeId: string) {
    const ep = state.episodes.find((e) => e.id === episodeId)
    batchGeneratingEpisodes.add(episodeId)
    try {
      const result = await generateEpisodeStoryboardFirstFrames(episodeId)
      const { storyboards } = await getEpisodeStoryboards(episodeId)
      state.storyboardsByEpisode.set(episodeId, storyboards)
      void reloadProject()
      if (result.summary.failed > 0) {
        message.warning(`第 ${ep?.episodeNo ?? ''} 集：${result.summary.completed} 张成功，${result.summary.failed} 张失败`)
      } else {
        message.success(`第 ${ep?.episodeNo ?? ''} 集首帧图批量生成完成`)
      }
    } catch (error) {
      message.error(getApiErrorMessage(error))
    } finally {
      batchGeneratingEpisodes.delete(episodeId)
    }
  }

  function runGenerateCharacterImage(characterId: string, opts?: { force?: boolean }) {
    const c = state.characters.find((x) => x.id === characterId)
    generateCharacterImage(characterId, opts)
      .then(({ taskId }) => {
        taskCenter.register(taskId, {
          label: `参考图生成 · ${c?.name ?? '角色'}`,
          scope: characterId,
          kind: 'image_generation',
          onDone: async () => {
            await reloadAssetLibrary()
            message.success(`「${c?.name ?? ''}」参考图生成完成`)
          },
          onFailed: (msg) => message.error(msg ?? '参考图生成失败'),
        })
      })
      .catch((error) => message.error(getApiErrorMessage(error)))
  }

  function runGenerateSceneImage(sceneId: string, opts?: { force?: boolean }) {
    const s = state.scenes.find((x) => x.id === sceneId)
    generateSceneImage(sceneId, opts)
      .then(({ taskId }) => {
        taskCenter.register(taskId, {
          label: `参考图生成 · ${s?.name ?? '场景'}`,
          scope: sceneId,
          kind: 'image_generation',
          onDone: async () => {
            await reloadAssetLibrary()
            message.success(`「${s?.name ?? ''}」参考图生成完成`)
          },
          onFailed: (msg) => message.error(msg ?? '参考图生成失败'),
        })
      })
      .catch((error) => message.error(getApiErrorMessage(error)))
  }

  /** "⚡ 一键生成本集": chains script -> assets -> storyboards -> first-frame batch, skipping steps already done. */
  const pipelineRunning = reactive(new Set<string>())

  async function runQuickPipeline(episodeId: string) {
    if (pipelineRunning.has(episodeId)) return
    pipelineRunning.add(episodeId)
    try {
      let ep = state.episodes.find((e) => e.id === episodeId)
      if (!ep?.scriptId) {
        await runStepAndWait(() => generateScript(episodeId), 'script_generation', episodeId, '流水线 · 剧本生成')
        await reloadEpisodes()
        ep = state.episodes.find((e) => e.id === episodeId)
      }

      const assets = state.assetsByEpisode.get(episodeId)
      const hasAssets = !!assets && (assets.characters.length > 0 || assets.scenes.length > 0 || assets.props.length > 0)
      if (!hasAssets) {
        await runStepAndWait(() => extractAssets(episodeId), 'asset_extraction', episodeId, '流水线 · 提取资产')
        state.assetsByEpisode.set(episodeId, await getEpisodeAssets(episodeId))
        await reloadAssetLibrary()
      }

      let shots = state.storyboardsByEpisode.get(episodeId) ?? []
      if (shots.length === 0) {
        await runStepAndWait(() => generateStoryboards(episodeId), 'storyboard_generation', episodeId, '流水线 · 分镜生成')
        shots = (await getEpisodeStoryboards(episodeId)).storyboards
        state.storyboardsByEpisode.set(episodeId, shots)
      }

      if (shots.some((s) => !s.firstFrameImageUrl)) {
        await generateEpisodeStoryboardFirstFrames(episodeId)
        const { storyboards } = await getEpisodeStoryboards(episodeId)
        state.storyboardsByEpisode.set(episodeId, storyboards)
      }

      void reloadProject()
      message.success(`第 ${ep?.episodeNo ?? ''} 集一键生成完成`)
    } catch (error) {
      message.error(getApiErrorMessage(error))
    } finally {
      pipelineRunning.delete(episodeId)
    }
  }

  function runStepAndWait(
    start: () => Promise<{ taskId: string; status: string }>,
    kind: string,
    scope: string,
    label: string,
  ): Promise<void> {
    return start().then(
      ({ taskId }) =>
        new Promise<void>((resolve, reject) => {
          taskCenter.register(taskId, {
            label,
            scope,
            kind,
            onDone: () => resolve(),
            onFailed: (msg) => reject(new Error(msg ?? `${label}失败`)),
          })
        }),
    )
  }

  // ------------------------------------------------------------------ guide

  const modeStatus: ComputedRef<Record<Mode, ModeStatus>> = computed(() => {
    const hasFailedOfKind = (kind: string) => taskCenter.tasks.value.some((t) => t.kind === kind && t.status === 'failed')

    const novelDone = state.chapters.length > 0 && state.chapters.every((c) => (state.eventsByChapter.get(c.id)?.length ?? 0) > 0)
    const novelRun = taskCenter.isKindBusy('event_extraction')
    const novel: ModeStatus = novelRun ? 'run' : hasFailedOfKind('event_extraction') ? 'warn' : novelDone ? 'ok' : 'none'

    const scriptDone = state.episodes.length > 0 && state.episodes.every((e) => !!e.scriptId)
    const scriptRun = taskCenter.isKindBusy('script_generation') || taskCenter.isKindBusy('episode_planning')
    const script: ModeStatus = scriptRun ? 'run' : hasFailedOfKind('script_generation') ? 'warn' : scriptDone ? 'ok' : 'none'

    const withScript = state.episodes.filter((e) => e.scriptId)
    const boardDone = withScript.length > 0 && withScript.every((e) => (state.storyboardsByEpisode.get(e.id)?.length ?? 0) > 0)
    const boardRun = taskCenter.isKindBusy('storyboard_generation')
    const board: ModeStatus = boardRun ? 'run' : hasFailedOfKind('storyboard_generation') ? 'warn' : boardDone ? 'ok' : 'none'

    const assetsDone = state.characters.length > 0 && state.characters.every((c) => !!c.referenceImageUrl) &&
      state.scenes.every((s) => !!s.referenceImageUrl)
    const assetsRun = taskCenter.isKindBusy('asset_extraction') || taskCenter.isKindBusy('image_generation')
    const assets: ModeStatus = assetsRun ? 'run' : assetsDone && state.characters.length > 0 ? 'ok' : 'none'

    return { novel, script, board, assets }
  })

  const guide = computed<GuideInfo>(() => {
    const failedTask = taskCenter.tasks.value.find((t) => t.status === 'failed')
    if (failedTask) {
      return {
        kind: 'fail',
        text: `${failedTask.label} 失败${failedTask.errorMessage ? ' · ' + failedTask.errorMessage : ''}`,
        failedTask: { label: failedTask.label, kind: failedTask.kind, scope: failedTask.scope },
      }
    }

    if (state.chapters.length === 0) {
      return { kind: 'next', text: '导入小说开始创作', ctaLabel: '导入章节 →', target: { mode: 'novel' } }
    }

    const chapterNeedingEvents = state.chapters.find((c) => (state.eventsByChapter.get(c.id)?.length ?? 0) === 0)
    if (chapterNeedingEvents) {
      return {
        kind: 'next',
        text: `提取「${chapterNeedingEvents.title ?? '第 ' + chapterNeedingEvents.chapterNo + ' 章'}」事件`,
        ctaLabel: '提取事件 →',
        action: () => runExtractEvents(chapterNeedingEvents.id),
        target: { mode: 'novel', chapterId: chapterNeedingEvents.id },
      }
    }

    if (state.episodes.length === 0) {
      return {
        kind: 'next',
        text: '事件已提取，可以规划剧集了',
        ctaLabel: 'AI 规划剧集 →',
        action: runPlanEpisodes,
        target: { mode: 'script' },
      }
    }

    const epNoScript = state.episodes.find((e) => !e.scriptId)
    if (epNoScript) {
      return {
        kind: 'next',
        text: `第 ${epNoScript.episodeNo} 集尚无剧本`,
        ctaLabel: `生成第 ${epNoScript.episodeNo} 集剧本 →`,
        action: () => runGenerateScript(epNoScript.id),
        target: { mode: 'script', episodeId: epNoScript.id },
        quickLabel: '⚡ 一键生成本集',
        quickAction: () => runQuickPipeline(epNoScript.id),
      }
    }

    const epNoAssets = state.episodes.find((e) => {
      const a = state.assetsByEpisode.get(e.id)
      return !a || (a.characters.length === 0 && a.scenes.length === 0 && a.props.length === 0)
    })
    if (epNoAssets) {
      return {
        kind: 'next',
        text: `第 ${epNoAssets.episodeNo} 集剧本已生成，尚未提取资产`,
        ctaLabel: '提取角色/场景/道具 →',
        action: () => runExtractAssets(epNoAssets.id),
        target: { mode: 'script', episodeId: epNoAssets.id },
      }
    }

    const epNoBoard = state.episodes.find((e) => (state.storyboardsByEpisode.get(e.id)?.length ?? 0) === 0)
    if (epNoBoard) {
      return {
        kind: 'next',
        text: `第 ${epNoBoard.episodeNo} 集尚无分镜`,
        ctaLabel: `生成第 ${epNoBoard.episodeNo} 集分镜 →`,
        action: () => runGenerateStoryboards(epNoBoard.id),
        target: { mode: 'board', episodeId: epNoBoard.id },
        quickLabel: '⚡ 一键生成本集',
        quickAction: () => runQuickPipeline(epNoBoard.id),
      }
    }

    const epMissingFrames = state.episodes.find((e) =>
      (state.storyboardsByEpisode.get(e.id) ?? []).some((s) => !s.firstFrameImageUrl),
    )
    if (epMissingFrames) {
      const missing = (state.storyboardsByEpisode.get(epMissingFrames.id) ?? []).filter((s) => !s.firstFrameImageUrl).length
      return {
        kind: 'next',
        text: `第 ${epMissingFrames.episodeNo} 集有 ${missing} 个镜头缺首帧图`,
        ctaLabel: `批量生成第 ${epMissingFrames.episodeNo} 集分镜图 →`,
        action: () => runBatchGenerateFirstFrames(epMissingFrames.id),
        target: { mode: 'board', episodeId: epMissingFrames.id },
      }
    }

    const charsMissingImage = state.characters.filter((c) => !c.referenceImageUrl)
    if (charsMissingImage.length > 0) {
      return {
        kind: 'next',
        text: `${charsMissingImage.length} 个角色缺参考图`,
        ctaLabel: `生成 ${charsMissingImage.length} 个角色参考图 →`,
        target: { mode: 'assets' },
      }
    }

    return {
      kind: 'done',
      text: `本项目素材已齐 — ${state.episodes.length} 集剧本、分镜与首帧图全部生成完成`,
    }
  })

  function retryFailedTask(failed: { kind?: string; scope?: string } | undefined) {
    if (!failed?.kind || !failed.scope) return
    taskCenter.dismiss(failed.scope, failed.kind)
    if (failed.kind === 'event_extraction') runExtractEvents(failed.scope)
    else if (failed.kind === 'episode_planning') runPlanEpisodes()
    else if (failed.kind === 'script_generation') runGenerateScript(failed.scope, { force: true })
    else if (failed.kind === 'asset_extraction') runExtractAssets(failed.scope, { force: true })
    else if (failed.kind === 'storyboard_generation') runGenerateStoryboards(failed.scope, { force: true })
    else if (failed.kind === 'image_generation') {
      // scope may be a characterId, sceneId or storyboardId; try each generator.
      if (state.characters.some((c) => c.id === failed.scope)) runGenerateCharacterImage(failed.scope, { force: true })
      else if (state.scenes.some((s) => s.id === failed.scope)) runGenerateSceneImage(failed.scope, { force: true })
    }
  }

  refreshAll()

  return {
    projectId,
    state,
    guide,
    modeStatus,
    refreshAll,
    loadScriptFor,
    loadSourceEventsFor,
    saveScript,
    retryFailedTask,
    batchGeneratingEpisodes,
    pipelineRunning,
    actions: {
      extractEvents: runExtractEvents,
      planEpisodes: runPlanEpisodes,
      generateScript: runGenerateScript,
      extractAssets: runExtractAssets,
      generateStoryboards: runGenerateStoryboards,
      generateStoryboardFirstFrame: runGenerateStoryboardFirstFrame,
      batchGenerateFirstFrames: runBatchGenerateFirstFrames,
      generateCharacterImage: runGenerateCharacterImage,
      generateSceneImage: runGenerateSceneImage,
      quickPipeline: runQuickPipeline,
    },
  }
}

export type WorkbenchStore = ReturnType<typeof createWorkbenchStore>
