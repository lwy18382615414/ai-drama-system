import { get, post } from './request'
import type { Batch } from './models'

/**
 * Batches resource — mirrors apps/server/routes/episode-planner.ts (batch routes)
 * + episode-planner-service.ts.
 */

/** GET /api/projects/:id/batches → { batches }. */
export function fetchBatches(projectId: string, signal?: AbortSignal): Promise<Batch[]> {
  return get<{ batches: Batch[] }>(`/projects/${projectId}/batches`, { signal }).then((d) => d.batches)
}

export interface CreateBatchPayload {
  /** Upper chapter bound for this batch; omitted plans through the last available chapter. */
  chapterEndNo?: number
  options?: Record<string, unknown>
}

/** Async planning result (202). */
export interface PlanningTaskResult {
  taskId: string
  batchId: string
  status: 'pending'
}

/** POST /api/projects/:id/batches → 202 { taskId, batchId, status }. */
export function createBatch(projectId: string, payload: CreateBatchPayload = {}): Promise<PlanningTaskResult> {
  return post(`/projects/${projectId}/batches`, payload)
}

/** POST /api/projects/:id/batches/:batchId/replan → 202 { taskId, batchId, status }. */
export function replanBatch(projectId: string, batchId: string): Promise<PlanningTaskResult> {
  return post(`/projects/${projectId}/batches/${batchId}/replan`, {})
}
