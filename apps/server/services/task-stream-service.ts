import { and, asc, eq, gte, inArray, or } from 'drizzle-orm'
import type { DatabaseClient } from '../../../packages/database/index.js'
import { generationTasks } from '../../../packages/database/index.js'
import { toTaskEvent, type TaskEvent } from '../../../packages/tasks/index.js'

/**
 * How far back a terminal (completed/failed) task is still worth replaying to a reconnecting
 * client. Live tasks (pending/running) are always included regardless of age.
 */
export const RECOVERABLE_TERMINAL_WINDOW_MS = 5 * 60 * 1000

/**
 * The reconnect snapshot for a project: every in-flight task plus recently settled ones. A client
 * (re)opening the SSE stream uses this to rebuild its view from the database truth, covering any
 * status changes that happened while it was disconnected.
 */
export async function listRecoverableTasks(
  db: DatabaseClient,
  projectId: string,
): Promise<TaskEvent[]> {
  const cutoff = new Date(Date.now() - RECOVERABLE_TERMINAL_WINDOW_MS).toISOString()

  const rows = await db
    .select()
    .from(generationTasks)
    .where(
      and(
        eq(generationTasks.projectId, projectId),
        or(
          inArray(generationTasks.status, ['pending', 'running']),
          and(
            inArray(generationTasks.status, ['completed', 'failed']),
            gte(generationTasks.updatedAt, cutoff),
          ),
        ),
      ),
    )
    .orderBy(asc(generationTasks.createdAt))

  return rows.map(toTaskEvent)
}
