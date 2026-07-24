/**
 * Optional metadata stamped on a generation task when it is enqueued as one step of a
 * larger orchestrated run (e.g. the one-click pipeline). Kept in a leaf module so the
 * per-step enqueue services can accept it without importing the orchestrator (which in
 * turn imports them).
 *
 * - `jobId` links the task to its parent {@link generationJobs} row so the worker's
 *   post-settle hook and the frontend's aggregate progress can find it.
 * - `idempotencyKey` is a deterministic per-step key backed by a UNIQUE index, so two
 *   concurrent advance passes cannot enqueue the same step twice.
 */
export interface TaskOrchestration {
  jobId?: string | null
  idempotencyKey?: string | null
}

/** True when an insert failed because the idempotency-key UNIQUE index rejected a duplicate. */
export function isUniqueConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('UNIQUE constraint failed')
}
