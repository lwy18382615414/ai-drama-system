import { apiClient } from '@/api/client'

export interface Storyboard {
  id: string
  projectId: string
  episodeId: string
  shotNo: number
  duration: number
  sceneId: string | null
  characterIds: string[]
  propIds: string[]
  scriptSectionNo: number | null
  shotType: string
  cameraAngle: string | null
  cameraMovement: string | null
  action: string
  dialogue: unknown[]
  narration: string | null
  emotion: string | null
  imagePrompt: string
  videoPrompt: string
  firstFrameImageUrl: string | null
  lastFrameImageUrl: string | null
  videoUrl: string | null
  ttsAudioUrl: string | null
  subtitleUrl: string | null
  composedVideoUrl: string | null
  status: string
  createdAt: string
  updatedAt: string
}

export interface PatchStoryboardInput {
  shotNo?: number
  duration?: number
  sceneId?: string | null
  characterIds?: string[]
  propIds?: string[]
  scriptSectionNo?: number | null
  shotType?: string
  cameraAngle?: string | null
  cameraMovement?: string | null
  action?: string
  dialogue?: unknown[]
  narration?: string | null
  emotion?: string | null
  imagePrompt?: string
  videoPrompt?: string
  firstFrameImageUrl?: string | null
  lastFrameImageUrl?: string | null
  videoUrl?: string | null
  ttsAudioUrl?: string | null
  subtitleUrl?: string | null
  composedVideoUrl?: string | null
  status?: string
}

export async function generateStoryboards(
  episodeId: string,
  opts?: { force?: boolean },
): Promise<{ taskId: string; status: string }> {
  const { data } = await apiClient.post<{ taskId: string; status: string }>(
    `/episodes/${episodeId}/generate-storyboards`,
    { force: opts?.force },
  )
  return data
}

export async function getEpisodeStoryboards(
  episodeId: string,
): Promise<{ episode: { id: string; episodeNo: number; title: string | null }; storyboards: Storyboard[] }> {
  const { data } = await apiClient.get<{
    episode: { id: string; episodeNo: number; title: string | null }
    storyboards: Storyboard[]
  }>(`/episodes/${episodeId}/storyboards`)
  return data
}

export async function getStoryboard(storyboardId: string): Promise<Storyboard> {
  const { data } = await apiClient.get<{ storyboard: Storyboard }>(`/storyboards/${storyboardId}`)
  return data.storyboard
}

export async function generateStoryboardFirstFrame(
  storyboardId: string,
  opts?: { force?: boolean },
): Promise<{ taskId: string; status: string }> {
  const { data } = await apiClient.post<{ taskId: string; status: string }>(
    `/storyboards/${storyboardId}/generate-first-frame`,
    { force: opts?.force },
  )
  return data
}

export interface BatchImageGenerationSummary {
  total: number
  completed: number
  skipped: number
  failed: number
}

export interface BatchImageGenerationResult {
  episodeId: string
  targetType: string
  summary: BatchImageGenerationSummary
  results: Array<{ targetId: string; status: 'completed' | 'skipped' | 'failed'; taskId?: string; imageUrl?: string; error?: string }>
}

/** Batch-generates first-frame images for every storyboard in the episode that's missing one (awaits completion server-side). */
export async function generateEpisodeStoryboardFirstFrames(
  episodeId: string,
  opts?: { force?: boolean },
): Promise<BatchImageGenerationResult> {
  const { data } = await apiClient.post<BatchImageGenerationResult>(
    `/episodes/${episodeId}/generate-storyboard-first-frames`,
    { force: opts?.force },
    { timeout: 180_000 },
  )
  return data
}

export async function updateStoryboard(storyboardId: string, patch: PatchStoryboardInput): Promise<Storyboard> {
  const body = {
    shot_no: patch.shotNo,
    duration: patch.duration,
    scene_id: patch.sceneId,
    character_ids: patch.characterIds,
    prop_ids: patch.propIds,
    script_section_no: patch.scriptSectionNo,
    shot_type: patch.shotType,
    camera_angle: patch.cameraAngle,
    camera_movement: patch.cameraMovement,
    action: patch.action,
    dialogue: patch.dialogue,
    narration: patch.narration,
    emotion: patch.emotion,
    image_prompt: patch.imagePrompt,
    video_prompt: patch.videoPrompt,
    first_frame_image_url: patch.firstFrameImageUrl,
    last_frame_image_url: patch.lastFrameImageUrl,
    video_url: patch.videoUrl,
    tts_audio_url: patch.ttsAudioUrl,
    subtitle_url: patch.subtitleUrl,
    composed_video_url: patch.composedVideoUrl,
    status: patch.status,
  }
  const { data } = await apiClient.patch<{ storyboard: Storyboard }>(`/storyboards/${storyboardId}`, body)
  return data.storyboard
}
