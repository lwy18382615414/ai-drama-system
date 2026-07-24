import { computed, unref, type MaybeRefOrGetter } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import {
  fetchActivePipelineRun,
  startPipelineRun,
  type PipelineRunPhase,
  type StartPipelineRunPayload,
} from '@/api/pipelineRun'
import { queryKeys } from '@/api/queryKeys'
import { invalidateActivity } from './useTaskInvalidation'

const resolve = (v: MaybeRefOrGetter<string>) => (typeof v === 'function' ? v() : unref(v))

const NON_TERMINAL: PipelineRunPhase[] = ['extracting', 'planning', 'producing']

/**
 * One-click pipeline run. Enqueue is task-class (only moves activity views); the run's own
 * progress is polled while active and refreshed by the project SSE stream on task settles.
 */
export function useStartPipelineRunMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: StartPipelineRunPayload) => startPipelineRun(payload),
    onSuccess: (_data, vars) => {
      invalidateActivity(qc, vars.projectId)
      qc.invalidateQueries({ queryKey: queryKeys.pipelineRun(vars.projectId) })
    },
  })
}

export function useActivePipelineRunQuery(projectId: MaybeRefOrGetter<string>) {
  const id = computed(() => resolve(projectId))
  const query = useQuery({
    queryKey: computed(() => queryKeys.pipelineRun(id.value)),
    queryFn: ({ signal }) => fetchActivePipelineRun(id.value, signal),
    enabled: computed(() => Boolean(id.value)),
    // While a run is active, poll so its phase advances even between SSE task settles.
    refetchInterval: (query) =>
      query.state.data && NON_TERMINAL.includes(query.state.data.metadata.phase) ? 3000 : false,
  })
  return query
}
