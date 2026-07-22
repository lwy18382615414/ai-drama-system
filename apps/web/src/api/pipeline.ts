import { get } from './request'
import type { PipelineDisplayStatus } from './models'

/**
 * Episode pipeline status — mirrors apps/server/routes/episode-pipeline.ts
 * + episode-pipeline-service.computeEpisodePipelineStatus().
 */

export type PipelineStage =
  | 'events_ready'
  | 'planning_ready'
  | 'script_ready'
  | 'assets_ready'
  | 'storyboards_ready'
  | 'images_ready'

export interface EpisodePipelineStatus {
  episodeId: string
  revisions: {
    planning: number
    script: number
    assets: number
    storyboards: number
    images: number
  }
  stages: Record<PipelineStage, PipelineDisplayStatus>
}

/** GET /api/episodes/:id/pipeline-status → { pipeline }. */
export function fetchEpisodePipelineStatus(
  episodeId: string,
  signal?: AbortSignal,
): Promise<EpisodePipelineStatus> {
  return get<{ pipeline: EpisodePipelineStatus }>(`/episodes/${episodeId}/pipeline-status`, {
    signal,
  }).then((d) => d.pipeline)
}
