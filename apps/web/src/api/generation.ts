import { get, post } from './request'
import type {
  Asset,
  GenerationJob,
  GenerationTask,
  ImageTargetType,
  StartTaskResult,
} from './models'

/**
 * Image generation + generation task/job control — mirrors
 * apps/server/routes/image-generation.ts + image-generation-service.ts
 * + generation-job-service.ts.
 */

/** Image generation tuning knobs (ImageGenerationOptionsSchema). */
export interface ImageGenerationOptions {
  negative_prompt?: string
  width?: number
  height?: number
  style?: string
}

export interface GenerateImageBody {
  options?: ImageGenerationOptions
}

const forceSuffix = (force: boolean) => (force ? '?force=true' : '')

// ── Single-target (async, 202 → { taskId, status }) ──────────────────────────

/** POST /api/characters/:id/generate-image. */
export function generateCharacterImage(
  characterId: string,
  body: GenerateImageBody = {},
  force = false,
): Promise<StartTaskResult> {
  return post(`/characters/${characterId}/generate-image${forceSuffix(force)}`, body)
}

/** POST /api/scenes/:id/generate-image. */
export function generateSceneImage(
  sceneId: string,
  body: GenerateImageBody = {},
  force = false,
): Promise<StartTaskResult> {
  return post(`/scenes/${sceneId}/generate-image${forceSuffix(force)}`, body)
}

/** POST /api/storyboards/:id/generate-first-frame. */
export function generateStoryboardFirstFrame(
  storyboardId: string,
  body: GenerateImageBody = {},
  force = false,
): Promise<StartTaskResult> {
  return post(`/storyboards/${storyboardId}/generate-first-frame${forceSuffix(force)}`, body)
}

export interface StartProjectImageBody {
  target_type: ImageTargetType
  target_id: string
  prompt_override?: string
  force?: boolean
  options?: ImageGenerationOptions
}

/** POST /api/projects/:id/generate-image (generic single target). */
export function generateProjectImage(
  projectId: string,
  body: StartProjectImageBody,
): Promise<StartTaskResult> {
  return post(`/projects/${projectId}/generate-image`, body)
}

// ── Episode batches ───────────────────────────────────────────────────────────

export interface BatchTargetResult {
  targetId: string
  status: 'completed' | 'skipped' | 'failed'
  taskId?: string
  imageUrl?: string
  error?: string
}

export interface BatchImageGenerationResult {
  episodeId: string
  targetType: ImageTargetType
  summary: { total: number; completed: number; skipped: number; failed: number }
  results: BatchTargetResult[]
}

/** POST /api/episodes/:id/generate-character-images (inline, 200). */
export function generateEpisodeCharacterImages(
  episodeId: string,
  body: GenerateImageBody = {},
  force = false,
): Promise<BatchImageGenerationResult> {
  return post(`/episodes/${episodeId}/generate-character-images${forceSuffix(force)}`, body)
}

/** POST /api/episodes/:id/generate-scene-images (inline, 200). */
export function generateEpisodeSceneImages(
  episodeId: string,
  body: GenerateImageBody = {},
  force = false,
): Promise<BatchImageGenerationResult> {
  return post(`/episodes/${episodeId}/generate-scene-images${forceSuffix(force)}`, body)
}

export interface EnqueueStoryboardFirstFramesBody {
  /** Scope to a multi-selection; omitted means every shot in the episode. */
  storyboardIds?: string[]
  options?: ImageGenerationOptions
}

export interface EnqueueStoryboardFirstFramesResult {
  episodeId: string
  jobId: string | null
  total: number
  queued: string[]
  skipped: string[]
}

/** POST /api/episodes/:id/generate-storyboard-first-frames (async batch, 202). */
export function enqueueStoryboardFirstFrames(
  episodeId: string,
  body: EnqueueStoryboardFirstFramesBody = {},
  force = false,
): Promise<EnqueueStoryboardFirstFramesResult> {
  return post(`/episodes/${episodeId}/generate-storyboard-first-frames${forceSuffix(force)}`, body)
}

export interface GenerateAllImagesResult {
  episodeId: string
  characters: BatchImageGenerationResult
  scenes: BatchImageGenerationResult
  storyboardFirstFrames: BatchImageGenerationResult
}

/** POST /api/episodes/:id/generate-all-images (inline, 200). */
export function generateAllEpisodeImages(
  episodeId: string,
  body: GenerateImageBody = {},
  force = false,
): Promise<GenerateAllImagesResult> {
  return post(`/episodes/${episodeId}/generate-all-images${forceSuffix(force)}`, body)
}

// ── Status + task/job control ─────────────────────────────────────────────────

export interface ImageAssetStatusCounts {
  total: number
  completed: number
  missing: number
  failed: number
}

export interface EpisodeImageGenerationStatus {
  episodeId: string
  characters: ImageAssetStatusCounts
  scenes: ImageAssetStatusCounts
  storyboardFirstFrames: ImageAssetStatusCounts
}

/** GET /api/episodes/:id/image-generation-status. */
export function fetchImageGenerationStatus(
  episodeId: string,
  signal?: AbortSignal,
): Promise<EpisodeImageGenerationStatus> {
  return get(`/episodes/${episodeId}/image-generation-status`, { signal })
}

/** GET /api/generation-tasks/:id → { task }. */
export function fetchGenerationTask(taskId: string, signal?: AbortSignal): Promise<GenerationTask> {
  return get<{ task: GenerationTask }>(`/generation-tasks/${taskId}`, { signal }).then((d) => d.task)
}

/** POST /api/generation-tasks/:id/cancel → { task }. */
export function cancelGenerationTask(taskId: string): Promise<GenerationTask> {
  return post<{ task: GenerationTask }>(`/generation-tasks/${taskId}/cancel`, {}).then((d) => d.task)
}

/** GET /api/generation-jobs/:id → { job }. */
export function fetchGenerationJob(jobId: string, signal?: AbortSignal): Promise<GenerationJob> {
  return get<{ job: GenerationJob }>(`/generation-jobs/${jobId}`, { signal }).then((d) => d.job)
}

/** POST /api/generation-jobs/:id/cancel → { job }. */
export function cancelGenerationJob(jobId: string): Promise<GenerationJob> {
  return post<{ job: GenerationJob }>(`/generation-jobs/${jobId}/cancel`, {}).then((d) => d.job)
}

/** GET /api/projects/:id/assets → { projectId, assets }. */
export function fetchProjectAssets(projectId: string, signal?: AbortSignal): Promise<Asset[]> {
  return get<{ projectId: string; assets: Asset[] }>(`/projects/${projectId}/assets`, { signal }).then(
    (d) => d.assets,
  )
}
