import type { QueryClient } from '@tanstack/vue-query'
import { queryKeys } from '@/api/queryKeys'

/**
 * The task-class mutation rule (agreed invalidation policy): a mutation that only
 * enqueues a task/job does NOT touch its target resource — it flips the activity
 * views (jobs + pipeline) so the board cell moves to queued/running immediately, and
 * the target-resource refresh lands later via useProjectTaskStream on settlement.
 */
export function invalidateActivity(qc: QueryClient, projectId: string, episodeId?: string) {
  qc.invalidateQueries({ queryKey: queryKeys.jobs(projectId) })
  qc.invalidateQueries({ queryKey: queryKeys.episodePipeline(projectId) })
  if (episodeId) {
    qc.invalidateQueries({ queryKey: queryKeys.episodePipelineStatus(episodeId) })
  }
}
