import { computed, unref, type MaybeRefOrGetter } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { createBatch, fetchBatches, replanBatch, type CreateBatchPayload } from '@/api/batches'
import { queryKeys } from '@/api/queryKeys'
import { invalidateActivity } from './useTaskInvalidation'

const resolve = (v: MaybeRefOrGetter<string>) => (typeof v === 'function' ? v() : unref(v))

/**
 * Batches list + planning/replan. Planning is task-class: the batch row is created
 * synchronously (so we refresh the batch list), while the episodes it produces land
 * later via SSE — hence only jobs+pipeline are flipped here.
 */
export function useBatchesQuery(projectId: MaybeRefOrGetter<string>) {
  const id = computed(() => resolve(projectId))
  return useQuery({
    queryKey: computed(() => queryKeys.batches(id.value)),
    queryFn: ({ signal }) => fetchBatches(id.value, signal),
    enabled: computed(() => Boolean(id.value)),
  })
}

export function useCreateBatchMutation(projectId: MaybeRefOrGetter<string>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateBatchPayload = {}) => createBatch(resolve(projectId), payload),
    onSuccess: () => {
      const id = resolve(projectId)
      qc.invalidateQueries({ queryKey: queryKeys.batches(id) })
      invalidateActivity(qc, id)
    },
  })
}

export function useReplanBatchMutation(projectId: MaybeRefOrGetter<string>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (batchId: string) => replanBatch(resolve(projectId), batchId),
    onSuccess: () => {
      const id = resolve(projectId)
      qc.invalidateQueries({ queryKey: queryKeys.batches(id) })
      invalidateActivity(qc, id)
    },
  })
}
