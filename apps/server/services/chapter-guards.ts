import { and, eq, inArray, sql } from 'drizzle-orm'
import type { DatabaseClient } from '../../../packages/database/index.js'
import { batches, generationTasks } from '../../../packages/database/index.js'

/**
 * Shared guards for chapter-mutating operations (batch event extraction, chapter deletion).
 *
 * Batch planning depends on contiguous chapterNo ranges, and planned chapters' events are
 * referenced by episode_event_links — so chapters at or below the last batch's chapterEndNo
 * must never be re-extracted (FK violation on delete+reinsert) or deleted (range gap).
 */

/** Highest chapter number already planned into a batch (0 when the project has no batches). */
export async function plannedChapterEndNo(db: DatabaseClient, projectId: string): Promise<number> {
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${batches.chapterEndNo}), 0)` })
    .from(batches)
    .where(eq(batches.projectId, projectId))

  return Number(row?.max ?? 0)
}

/**
 * Chapter ids with a pending/running event_extraction task. The chapterId only lives in the
 * task's inputJson, so active rows are parsed best-effort (malformed JSON is ignored).
 */
export async function activeExtractionChapterIds(db: DatabaseClient, projectId: string): Promise<Set<string>> {
  const rows = await db
    .select({ inputJson: generationTasks.inputJson })
    .from(generationTasks)
    .where(
      and(
        eq(generationTasks.projectId, projectId),
        eq(generationTasks.taskType, 'event_extraction'),
        inArray(generationTasks.status, ['pending', 'running']),
      ),
    )

  const chapterIds = new Set<string>()
  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.inputJson) as { chapterId?: unknown }
      if (typeof parsed?.chapterId === 'string' && parsed.chapterId.length > 0) {
        chapterIds.add(parsed.chapterId)
      }
    } catch {
      // Malformed inputJson never blocks the guard; the worker will fail such tasks anyway.
    }
  }

  return chapterIds
}
