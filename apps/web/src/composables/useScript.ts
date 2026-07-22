import { computed, unref, type MaybeRefOrGetter } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import {
  fetchEpisodeScript,
  generateScript,
  updateScript,
  type GenerateScriptPayload,
  type PatchScriptPayload,
} from '@/api/script'
import { queryKeys } from '@/api/queryKeys'
import { invalidateActivity } from './useTaskInvalidation'

const resolve = (v: MaybeRefOrGetter<string>) => (typeof v === 'function' ? v() : unref(v))

/** Episode context needed so a mutation can flip the right activity/target keys. */
export interface EpisodeCtx {
  projectId: MaybeRefOrGetter<string>
  episodeId: MaybeRefOrGetter<string>
}

export function useScriptQuery(episodeId: MaybeRefOrGetter<string>) {
  const id = computed(() => resolve(episodeId))
  return useQuery({
    queryKey: computed(() => queryKeys.script(id.value)),
    queryFn: ({ signal }) => fetchEpisodeScript(id.value, signal),
    enabled: computed(() => Boolean(id.value)),
  })
}

/** Task-class: only flip jobs+pipeline; the script itself lands via SSE on settlement. */
export function useGenerateScriptMutation(ctx: EpisodeCtx) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { payload?: GenerateScriptPayload; force?: boolean } = {}) =>
      generateScript(resolve(ctx.episodeId), vars.payload ?? {}, vars.force ?? false),
    onSuccess: () => invalidateActivity(qc, resolve(ctx.projectId), resolve(ctx.episodeId)),
  })
}

/**
 * Edit-class: invalidate the script directly, plus the downstream resources the backend
 * marks stale on a script edit (assets / storyboards / images) so the UI shows the staleness.
 */
export function useUpdateScriptMutation(episodeId: MaybeRefOrGetter<string>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { scriptId: string; payload: PatchScriptPayload }) =>
      updateScript(vars.scriptId, vars.payload),
    onSuccess: () => {
      const eid = resolve(episodeId)
      qc.invalidateQueries({ queryKey: queryKeys.script(eid) })
      qc.invalidateQueries({ queryKey: queryKeys.episodeAssets(eid) })
      qc.invalidateQueries({ queryKey: queryKeys.storyboards(eid) })
      qc.invalidateQueries({ queryKey: queryKeys.imageStatus(eid) })
      qc.invalidateQueries({ queryKey: queryKeys.episodePipelineStatus(eid) })
    },
  })
}
