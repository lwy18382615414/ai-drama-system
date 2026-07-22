import { get, post, patch } from './request'
import type { Episode, Storyboard, StartTaskResult } from './models'

/**
 * Storyboards resource — mirrors apps/server/routes/storyboard.ts + storyboard-service.ts.
 */

/** GET /api/episodes/:id/storyboards → { episode, storyboards }. */
export function fetchEpisodeStoryboards(
  episodeId: string,
  signal?: AbortSignal,
): Promise<{ episode: Episode; storyboards: Storyboard[] }> {
  return get(`/episodes/${episodeId}/storyboards`, { signal })
}

/** GET /api/storyboards/:id → { storyboard }. */
export function fetchStoryboard(storyboardId: string, signal?: AbortSignal): Promise<Storyboard> {
  return get<{ storyboard: Storyboard }>(`/storyboards/${storyboardId}`, { signal }).then(
    (d) => d.storyboard,
  )
}

export interface GenerateStoryboardsPayload {
  options?: Record<string, unknown>
}

/** POST /api/episodes/:id/generate-storyboards[?force=true] → 202 { taskId, status }. */
export function generateStoryboards(
  episodeId: string,
  payload: GenerateStoryboardsPayload = {},
  force = false,
): Promise<StartTaskResult> {
  return post(`/episodes/${episodeId}/generate-storyboards${force ? '?force=true' : ''}`, payload)
}

/** PATCH body — snake_case, mirrors PatchStoryboardRequestSchema. */
export type PatchStoryboardPayload = Partial<{
  shot_no: number
  duration: number
  scene_id: string | null
  character_ids: string[]
  prop_ids: string[]
  script_section_no: number | null
  shot_type: string
  camera_angle: string | null
  camera_movement: string | null
  action: string
  dialogue: unknown[]
  narration: string | null
  emotion: string | null
  image_prompt: string
  video_prompt: string
  first_frame_image_url: string | null
  last_frame_image_url: string | null
  video_url: string | null
  tts_audio_url: string | null
  subtitle_url: string | null
  composed_video_url: string | null
  status: string
}>

/** PATCH /api/storyboards/:id → { storyboard }. */
export function updateStoryboard(storyboardId: string, payload: PatchStoryboardPayload): Promise<Storyboard> {
  return patch<{ storyboard: Storyboard }>(`/storyboards/${storyboardId}`, payload).then(
    (d) => d.storyboard,
  )
}
