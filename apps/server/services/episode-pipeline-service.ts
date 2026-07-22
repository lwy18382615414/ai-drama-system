import { desc, eq } from 'drizzle-orm'
import type { DatabaseClient } from '../../../packages/database/index.js'
import {
  episodeCharacterLinks,
  episodePipelineStates,
  episodePropLinks,
  episodeSceneLinks,
  episodes,
  generationTasks,
  scripts,
  storyboards,
} from '../../../packages/database/index.js'

export type PipelineDisplayStatus = 'not_started' | 'queued' | 'running' | 'ready' | 'stale' | 'failed'

export interface EpisodePipelineStatus {
  episodeId: string
  revisions: {
    planning: number
    script: number
    assets: number
    storyboards: number
    images: number
  }
  stages: Record<'events_ready' | 'planning_ready' | 'script_ready' | 'assets_ready' | 'storyboards_ready' | 'images_ready', PipelineDisplayStatus>
}

/** Creates the per-episode revision row lazily so historical projects migrate safely. */
export async function ensureEpisodePipelineState(db: DatabaseClient, episodeId: string) {
  const now = new Date().toISOString()
  await db
    .insert(episodePipelineStates)
    .values({ episodeId, updatedAt: now })
    .onConflictDoNothing()
  const [state] = await db.select().from(episodePipelineStates).where(eq(episodePipelineStates.episodeId, episodeId)).limit(1)
  return state
}

/** Script edits invalidate the episode's derived assets, storyboards and their images. */
export async function invalidateAfterScriptChange(db: DatabaseClient, episodeId: string) {
  await ensureEpisodePipelineState(db, episodeId)
  const now = new Date().toISOString()
  await db
    .update(episodePipelineStates)
    .set({
      scriptRevision: (await currentRevision(db, episodeId, 'scriptRevision')) + 1,
      assetsStale: true,
      storyboardsStale: true,
      imagesStale: true,
      updatedAt: now,
    })
    .where(eq(episodePipelineStates.episodeId, episodeId))
  await db.update(storyboards).set({ status: 'stale', updatedAt: now }).where(eq(storyboards.episodeId, episodeId))
}

/** Derived status is a query view: persisted stale facts win over inferred task/row state. */
export async function computeEpisodePipelineStatus(db: DatabaseClient, episodeId: string): Promise<EpisodePipelineStatus | null> {
  const [episode] = await db.select().from(episodes).where(eq(episodes.id, episodeId)).limit(1)
  if (!episode) return null
  const state = await ensureEpisodePipelineState(db, episodeId)
  if (!state) return null

  const [[script], storyboardRows, characterLinks, sceneLinks, propLinks, taskRows] = await Promise.all([
    db.select().from(scripts).where(eq(scripts.episodeId, episodeId)).limit(1),
    db.select().from(storyboards).where(eq(storyboards.episodeId, episodeId)),
    db.select({ id: episodeCharacterLinks.id }).from(episodeCharacterLinks).where(eq(episodeCharacterLinks.episodeId, episodeId)).limit(1),
    db.select({ id: episodeSceneLinks.id }).from(episodeSceneLinks).where(eq(episodeSceneLinks.episodeId, episodeId)).limit(1),
    db.select({ id: episodePropLinks.id }).from(episodePropLinks).where(eq(episodePropLinks.episodeId, episodeId)).limit(1),
    db.select().from(generationTasks).where(eq(generationTasks.episodeId, episodeId)).orderBy(desc(generationTasks.updatedAt)),
  ])

  const taskStatus = (taskType: string): PipelineDisplayStatus | undefined => {
    const task = taskRows.find((row) => row.taskType === taskType)
    if (!task) return undefined
    if (task.status === 'pending' || task.status === 'retry_wait') return 'queued'
    if (task.status === 'running') return 'running'
    if (task.status === 'failed') return 'failed'
    return undefined
  }

  const hasAssets = characterLinks.length > 0 || sceneLinks.length > 0 || propLinks.length > 0
  const hasImages = storyboardRows.length > 0 && storyboardRows.every((row) => Boolean(row.firstFrameImageUrl))
  const stage = (ready: boolean, stale: boolean, taskType: string): PipelineDisplayStatus => {
    if (stale) return 'stale'
    const active = taskStatus(taskType)
    if (active) return active
    return ready ? 'ready' : 'not_started'
  }

  return {
    episodeId,
    revisions: {
      planning: state.planningRevision,
      script: state.scriptRevision,
      assets: state.assetRevision,
      storyboards: state.storyboardRevision,
      images: state.imageRevision,
    },
    stages: {
      events_ready: episode.status === 'draft' ? 'not_started' : 'ready',
      planning_ready: 'ready',
      script_ready: stage(Boolean(script), false, 'script_generation'),
      assets_ready: stage(hasAssets, state.assetsStale, 'asset_extraction'),
      storyboards_ready: stage(storyboardRows.length > 0, state.storyboardsStale, 'storyboard_generation'),
      images_ready: stage(hasImages, state.imagesStale, 'image_generation'),
    },
  }
}

async function currentRevision(
  db: DatabaseClient,
  episodeId: string,
  field: 'scriptRevision' | 'assetRevision' | 'storyboardRevision' | 'imageRevision',
) {
  const state = await ensureEpisodePipelineState(db, episodeId)
  return state?.[field] ?? 0
}
