import { get } from './request'
import type { Episode, NovelEvent } from './models'

/**
 * Episodes resource — mirrors the episode routes in apps/server/routes/episode-planner.ts
 * + episode-planner-service.ts.
 */

/** Per-episode pipeline readiness counts appended by withPipelineCounts(). */
export interface EpisodePipelineCounts {
  sceneLinkCount: number
  characterLinkCount: number
  storyboardCount: number
  firstFrameDoneCount: number
}

export type EpisodeWithCounts = Episode & EpisodePipelineCounts

/** One linked event as returned by GET episodes/:id/events. */
export interface EpisodeEventRow {
  linkId: string
  projectId: string
  episodeId: string
  novelEventId: string
  orderInEpisode: number
  usageType: string
  event: NovelEvent
}

/** GET /api/projects/:id/episodes → { episodes }. */
export function fetchEpisodes(projectId: string, signal?: AbortSignal): Promise<EpisodeWithCounts[]> {
  return get<{ episodes: EpisodeWithCounts[] }>(`/projects/${projectId}/episodes`, { signal }).then(
    (d) => d.episodes,
  )
}

/** GET /api/episodes/:id/events → { episode, events }. */
export function fetchEpisodeEvents(
  episodeId: string,
  signal?: AbortSignal,
): Promise<{ episode: Episode; events: EpisodeEventRow[] }> {
  return get(`/episodes/${episodeId}/events`, { signal })
}
