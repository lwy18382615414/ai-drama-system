import { computed, unref, type MaybeRefOrGetter } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import {
  fetchEpisodeStoryboards,
  fetchStoryboard,
  generateStoryboards,
  updateStoryboard,
  type GenerateStoryboardsPayload,
  type PatchStoryboardPayload,
} from '@/api/storyboards'
import { queryKeys } from '@/api/queryKeys'
import { invalidateActivity } from './useTaskInvalidation'
import type { EpisodeCtx } from './useScript'

const resolve = (v: MaybeRefOrGetter<string>) => (typeof v === 'function' ? v() : unref(v))

export function useStoryboardsQuery(episodeId: MaybeRefOrGetter<string>) {
  const id = computed(() => resolve(episodeId))
  return useQuery({
    queryKey: computed(() => queryKeys.storyboards(id.value)),
    queryFn: ({ signal }) => fetchEpisodeStoryboards(id.value, signal),
    enabled: computed(() => Boolean(id.value)),
  })
}

export function useStoryboardQuery(storyboardId: MaybeRefOrGetter<string>) {
  const id = computed(() => resolve(storyboardId))
  return useQuery({
    queryKey: computed(() => queryKeys.storyboard(id.value)),
    queryFn: ({ signal }) => fetchStoryboard(id.value, signal),
    enabled: computed(() => Boolean(id.value)),
  })
}

/** Task-class: shots land via SSE; only flip activity here. */
export function useGenerateStoryboardsMutation(ctx: EpisodeCtx) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { payload?: GenerateStoryboardsPayload; force?: boolean } = {}) =>
      generateStoryboards(resolve(ctx.episodeId), vars.payload ?? {}, vars.force ?? false),
    onSuccess: () => invalidateActivity(qc, resolve(ctx.projectId), resolve(ctx.episodeId)),
  })
}

/** Edit-class (image_prompt / shot fields): refresh the list and the single shot. */
export function useUpdateStoryboardMutation(episodeId: MaybeRefOrGetter<string>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { storyboardId: string; payload: PatchStoryboardPayload }) =>
      updateStoryboard(vars.storyboardId, vars.payload),
    onSuccess: (storyboard) => {
      qc.setQueryData(queryKeys.storyboard(storyboard.id), storyboard)
      qc.invalidateQueries({ queryKey: queryKeys.storyboards(resolve(episodeId)) })
    },
  })
}
