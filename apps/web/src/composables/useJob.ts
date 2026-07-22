import { computed, unref, type MaybeRefOrGetter } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { cancelGenerationJob, fetchGenerationJob } from '@/api/generation'
import { queryKeys } from '@/api/queryKeys'

/**
 * Single Job progress subscription + cancel (frontend-design.md §5.3).
 *
 * Progress is a persisted aggregate refreshed by the backend; this query is the
 * fallback read, while live movement arrives via useProjectTaskStream invalidations.
 * Failed-item retry has no dedicated backend endpoint (re-generation goes through the
 * per-resource generate mutations), so it is intentionally not exposed here.
 */
export function useJob(jobId: MaybeRefOrGetter<string>) {
  const qc = useQueryClient()
  const id = computed(() => (typeof jobId === 'function' ? jobId() : unref(jobId)))

  const jobQuery = useQuery({
    queryKey: computed(() => queryKeys.job(id.value)),
    queryFn: ({ signal }) => fetchGenerationJob(id.value, signal),
    enabled: computed(() => Boolean(id.value)),
  })

  const cancel = useMutation({
    mutationFn: () => cancelGenerationJob(id.value),
    onSuccess: (job) => {
      qc.setQueryData(queryKeys.job(job.id), job)
      qc.invalidateQueries({ queryKey: queryKeys.jobs(job.projectId) })
    },
  })

  return { jobQuery, cancel }
}
