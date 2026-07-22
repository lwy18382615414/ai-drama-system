import { computed, unref, type MaybeRefOrGetter } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import {
  fetchChapterEvents,
  fetchEventExtractionStatus,
  startBatchEventExtraction,
  startEventExtraction,
  type StartBatchEventExtractionPayload,
  type StartEventExtractionPayload,
} from '@/api/events'
import { queryKeys } from '@/api/queryKeys'
import { invalidateActivity } from './useTaskInvalidation'

const resolve = (v: MaybeRefOrGetter<string>) => (typeof v === 'function' ? v() : unref(v))

/**
 * Event extraction (per-chapter and batch) + chapter events read.
 * Extraction is task-class: chapter status flips over SSE, so on enqueue we only
 * move the activity views.
 */
export function useStartEventExtractionMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: StartEventExtractionPayload) => startEventExtraction(payload),
    onSuccess: (_data, vars) => invalidateActivity(qc, vars.projectId),
  })
}

export function useStartBatchEventExtractionMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: StartBatchEventExtractionPayload) => startBatchEventExtraction(payload),
    onSuccess: (_data, vars) => invalidateActivity(qc, vars.projectId),
  })
}

export function useChapterEventsQuery(chapterId: MaybeRefOrGetter<string>) {
  const id = computed(() => resolve(chapterId))
  return useQuery({
    queryKey: computed(() => queryKeys.chapterEvents(id.value)),
    queryFn: ({ signal }) => fetchChapterEvents(id.value, signal),
    enabled: computed(() => Boolean(id.value)),
  })
}

export function useEventExtractionStatusQuery(taskId: MaybeRefOrGetter<string>) {
  const id = computed(() => resolve(taskId))
  return useQuery({
    queryKey: computed(() => queryKeys.generationTask(id.value)),
    queryFn: ({ signal }) => fetchEventExtractionStatus(id.value, signal),
    enabled: computed(() => Boolean(id.value)),
  })
}
