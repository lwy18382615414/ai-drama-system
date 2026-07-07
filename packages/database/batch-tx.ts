import { and, eq, gt, inArray, sql } from 'drizzle-orm'
import type { DatabaseClient } from './client.js'
import {
  assets,
  batches,
  episodeCharacterLinks,
  episodeEventLinks,
  episodePropLinks,
  episodeSceneLinks,
  episodes,
  generationTasks,
  scripts,
  storyboards,
} from './schema.js'

/**
 * The subset of the drizzle client used by the tx helpers below. Both the top-level
 * `DatabaseClient` and the `tx` handle passed to `db.transaction` satisfy it, so these
 * helpers can run standalone or be composed inside a larger transaction (the planner
 * agent calls them inside its success tx).
 */
export type BatchTx = Pick<DatabaseClient, 'select' | 'update' | 'delete'>

// Episode numbers are shifted through this transient offset band to dodge the
// UNIQUE(project_id, episode_no) index during a renumber. Assumes a project never
// exceeds ~1e6 episodes, which is far beyond any realistic short-drama.
const RENUMBER_OFFSET = 1_000_000

/**
 * Re-number every episode after `boundaryNo` by `delta`, keeping the global
 * (projectId, episodeNo) sequence collision-free via a two-phase offset:
 * first lift the affected rows into a high band, then bring them down by `delta`.
 * Also shifts the episode ranges of every later batch by `delta` so batch metadata
 * stays in sync. `boundaryNo` is the re-planned batch's ORIGINAL episodeEndNo.
 * A `delta` of 0 is a no-op.
 */
export async function shiftEpisodeNumbers(
  tx: BatchTx,
  projectId: string,
  boundaryNo: number,
  delta: number,
): Promise<void> {
  if (delta === 0) return

  const now = new Date().toISOString()

  // Phase 1: lift all episodes after the boundary into the offset band.
  await tx
    .update(episodes)
    .set({ episodeNo: sql`${episodes.episodeNo} + ${RENUMBER_OFFSET}`, updatedAt: now })
    .where(and(eq(episodes.projectId, projectId), gt(episodes.episodeNo, boundaryNo)))

  // Phase 2: bring them back down, applying the delta.
  await tx
    .update(episodes)
    .set({ episodeNo: sql`${episodes.episodeNo} - ${RENUMBER_OFFSET} + ${delta}`, updatedAt: now })
    .where(and(eq(episodes.projectId, projectId), gt(episodes.episodeNo, boundaryNo + RENUMBER_OFFSET)))

  // Keep later batches' episode ranges consistent. batchNo is untouched, so no collision.
  await tx
    .update(batches)
    .set({
      episodeStartNo: sql`${batches.episodeStartNo} + ${delta}`,
      episodeEndNo: sql`${batches.episodeEndNo} + ${delta}`,
      updatedAt: now,
    })
    .where(and(eq(batches.projectId, projectId), gt(batches.episodeStartNo, boundaryNo)))
}

/**
 * Delete a batch's episode orchestration while preserving the project-level asset
 * library (characters/scenes/props + their reference images). No FK has ON DELETE
 * CASCADE, so children are deleted explicitly in FK-safe order. episode_event_links
 * must go before any re-link because novel_event_id is globally UNIQUE.
 *
 * Does NOT delete the `batches` row itself — the caller decides whether to reuse it
 * (re-plan) or drop it.
 */
export async function deleteBatchArtifacts(tx: BatchTx, batchId: string): Promise<void> {
  const episodeRows = await tx.select({ id: episodes.id }).from(episodes).where(eq(episodes.batchId, batchId))
  const episodeIds = episodeRows.map((row) => row.id)

  if (episodeIds.length === 0) return

  const storyboardRows = await tx
    .select({ id: storyboards.id })
    .from(storyboards)
    .where(inArray(storyboards.episodeId, episodeIds))
  const storyboardIds = storyboardRows.map((row) => row.id)

  // Storyboard first-frame images: assets are polymorphic (targetType + targetId), no FK.
  if (storyboardIds.length > 0) {
    await tx
      .delete(assets)
      .where(and(eq(assets.targetType, 'storyboard_first_frame'), inArray(assets.targetId, storyboardIds)))
    // Tidy the task center: drop generation tasks pinned to these storyboards.
    await tx.delete(generationTasks).where(inArray(generationTasks.storyboardId, storyboardIds))
  }

  await tx.delete(storyboards).where(inArray(storyboards.episodeId, episodeIds))
  await tx.delete(scripts).where(inArray(scripts.episodeId, episodeIds))
  await tx.delete(episodeEventLinks).where(inArray(episodeEventLinks.episodeId, episodeIds))
  await tx.delete(episodeCharacterLinks).where(inArray(episodeCharacterLinks.episodeId, episodeIds))
  await tx.delete(episodeSceneLinks).where(inArray(episodeSceneLinks.episodeId, episodeIds))
  await tx.delete(episodePropLinks).where(inArray(episodePropLinks.episodeId, episodeIds))
  await tx.delete(episodes).where(inArray(episodes.id, episodeIds))
}
