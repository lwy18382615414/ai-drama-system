import type { GenerationTask } from '../database/index.js'

/**
 * A task lifecycle event, emitted whenever a `generation_tasks` row changes status.
 * Shared by the {@link TaskEventBus} (live push) and the reconnect snapshot query so that
 * both carry an identical payload shape to clients.
 */
export interface TaskEvent {
  taskId: string
  projectId: string
  taskType: string
  targetType: string | null
  targetId: string | null
  episodeId: string | null
  storyboardId: string | null
  status: string
  retryCount: number
  errorMessage: string | null
  updatedAt: string
}

/**
 * Process-local pub/sub over task lifecycle events, scoped by project. The {@link TaskWorker}
 * implements this so SSE endpoints can subscribe without an external message broker.
 * Swap for Redis Pub/Sub (or Postgres LISTEN/NOTIFY) when moving beyond a single process.
 */
export interface TaskEventBus {
  /** Registers a listener for a project's task events. Returns an unsubscribe function. */
  subscribe(projectId: string, listener: (event: TaskEvent) => void): () => void
}

/** Projects a persisted task row onto the wire-facing {@link TaskEvent} shape. */
export function toTaskEvent(row: GenerationTask): TaskEvent {
  return {
    taskId: row.id,
    projectId: row.projectId,
    taskType: row.taskType,
    targetType: row.targetType ?? null,
    targetId: row.targetId ?? null,
    episodeId: row.episodeId ?? null,
    storyboardId: row.storyboardId ?? null,
    status: row.status,
    retryCount: row.retryCount,
    errorMessage: row.errorMessage ?? null,
    updatedAt: row.updatedAt,
  }
}
