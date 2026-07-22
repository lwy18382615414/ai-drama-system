import { computed, unref, type MaybeRefOrGetter } from 'vue'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/vue-query'
import {
  cancelGenerationTask,
  enqueueStoryboardFirstFrames,
  fetchGenerationTask,
  fetchImageGenerationStatus,
  fetchProjectAssets,
  generateAllEpisodeImages,
  generateCharacterImage,
  generateEpisodeCharacterImages,
  generateEpisodeSceneImages,
  generateProjectImage,
  generateSceneImage,
  generateStoryboardFirstFrame,
  type EnqueueStoryboardFirstFramesBody,
  type GenerateImageBody,
  type StartProjectImageBody,
} from '@/api/generation'
import { queryKeys } from '@/api/queryKeys'
import { invalidateActivity } from './useTaskInvalidation'

const resolve = (v: MaybeRefOrGetter<string>) => (typeof v === 'function' ? v() : unref(v))
const resolveOpt = (v?: MaybeRefOrGetter<string>) =>
  v === undefined ? undefined : typeof v === 'function' ? v() : unref(v)

/** Project + optional episode context for image mutations. */
export interface ImageCtx {
  projectId: MaybeRefOrGetter<string>
  episodeId?: MaybeRefOrGetter<string>
}

/** Refresh everything an inline (synchronous) episode image batch just changed. */
function invalidateEpisodeImages(qc: QueryClient, projectId: string, episodeId: string) {
  qc.invalidateQueries({ queryKey: queryKeys.imageStatus(episodeId) })
  qc.invalidateQueries({ queryKey: queryKeys.storyboards(episodeId) })
  qc.invalidateQueries({ queryKey: queryKeys.characters(projectId) })
  qc.invalidateQueries({ queryKey: queryKeys.scenes(projectId) })
  qc.invalidateQueries({ queryKey: queryKeys.projectAssets(projectId) })
  qc.invalidateQueries({ queryKey: queryKeys.episodePipelineStatus(episodeId) })
}

// ── Queries ───────────────────────────────────────────────────────────────────

export function useImageGenerationStatusQuery(episodeId: MaybeRefOrGetter<string>) {
  const id = computed(() => resolve(episodeId))
  return useQuery({
    queryKey: computed(() => queryKeys.imageStatus(id.value)),
    queryFn: ({ signal }) => fetchImageGenerationStatus(id.value, signal),
    enabled: computed(() => Boolean(id.value)),
  })
}

export function useProjectAssetsQuery(projectId: MaybeRefOrGetter<string>) {
  const id = computed(() => resolve(projectId))
  return useQuery({
    queryKey: computed(() => queryKeys.projectAssets(id.value)),
    queryFn: ({ signal }) => fetchProjectAssets(id.value, signal),
    enabled: computed(() => Boolean(id.value)),
  })
}

export function useGenerationTaskQuery(taskId: MaybeRefOrGetter<string>) {
  const id = computed(() => resolve(taskId))
  return useQuery({
    queryKey: computed(() => queryKeys.generationTask(id.value)),
    queryFn: ({ signal }) => fetchGenerationTask(id.value, signal),
    enabled: computed(() => Boolean(id.value)),
  })
}

// ── Single-target (async, task-class) ─────────────────────────────────────────

export function useGenerateCharacterImageMutation(ctx: ImageCtx) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { characterId: string; body?: GenerateImageBody; force?: boolean }) =>
      generateCharacterImage(vars.characterId, vars.body ?? {}, vars.force ?? false),
    onSuccess: () => invalidateActivity(qc, resolve(ctx.projectId), resolveOpt(ctx.episodeId)),
  })
}

export function useGenerateSceneImageMutation(ctx: ImageCtx) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { sceneId: string; body?: GenerateImageBody; force?: boolean }) =>
      generateSceneImage(vars.sceneId, vars.body ?? {}, vars.force ?? false),
    onSuccess: () => invalidateActivity(qc, resolve(ctx.projectId), resolveOpt(ctx.episodeId)),
  })
}

export function useGenerateStoryboardFirstFrameMutation(ctx: ImageCtx) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { storyboardId: string; body?: GenerateImageBody; force?: boolean }) =>
      generateStoryboardFirstFrame(vars.storyboardId, vars.body ?? {}, vars.force ?? false),
    onSuccess: () => invalidateActivity(qc, resolve(ctx.projectId), resolveOpt(ctx.episodeId)),
  })
}

export function useGenerateProjectImageMutation(projectId: MaybeRefOrGetter<string>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: StartProjectImageBody) => generateProjectImage(resolve(projectId), body),
    onSuccess: () => invalidateActivity(qc, resolve(projectId)),
  })
}

// ── Episode batches ───────────────────────────────────────────────────────────

/** Inline (synchronous) — results are final on return, so refresh the target directly. */
export function useGenerateEpisodeCharacterImagesMutation(ctx: Required<ImageCtx>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { body?: GenerateImageBody; force?: boolean } = {}) =>
      generateEpisodeCharacterImages(resolve(ctx.episodeId), vars.body ?? {}, vars.force ?? false),
    onSuccess: () => invalidateEpisodeImages(qc, resolve(ctx.projectId), resolve(ctx.episodeId)),
  })
}

/** Inline (synchronous). */
export function useGenerateEpisodeSceneImagesMutation(ctx: Required<ImageCtx>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { body?: GenerateImageBody; force?: boolean } = {}) =>
      generateEpisodeSceneImages(resolve(ctx.episodeId), vars.body ?? {}, vars.force ?? false),
    onSuccess: () => invalidateEpisodeImages(qc, resolve(ctx.projectId), resolve(ctx.episodeId)),
  })
}

/** Async batch (creates a Job) — task-class: flip activity, frames land via SSE. */
export function useEnqueueStoryboardFirstFramesMutation(ctx: Required<ImageCtx>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { body?: EnqueueStoryboardFirstFramesBody; force?: boolean } = {}) =>
      enqueueStoryboardFirstFrames(resolve(ctx.episodeId), vars.body ?? {}, vars.force ?? false),
    onSuccess: () => invalidateActivity(qc, resolve(ctx.projectId), resolve(ctx.episodeId)),
  })
}

/** Inline (synchronous) — character + scene run inline; storyboard frames are enqueued. */
export function useGenerateAllEpisodeImagesMutation(ctx: Required<ImageCtx>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { body?: GenerateImageBody; force?: boolean } = {}) =>
      generateAllEpisodeImages(resolve(ctx.episodeId), vars.body ?? {}, vars.force ?? false),
    onSuccess: () => {
      invalidateEpisodeImages(qc, resolve(ctx.projectId), resolve(ctx.episodeId))
      invalidateActivity(qc, resolve(ctx.projectId), resolve(ctx.episodeId))
    },
  })
}

// ── Task control ────────────────────────────────────────────────────────────────

export function useCancelGenerationTaskMutation(projectId: MaybeRefOrGetter<string>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (taskId: string) => cancelGenerationTask(taskId),
    onSuccess: (task) => {
      qc.setQueryData(queryKeys.generationTask(task.id), task)
      invalidateActivity(qc, resolve(projectId), task.episodeId ?? undefined)
    },
  })
}
