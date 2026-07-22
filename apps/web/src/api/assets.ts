import { get, post } from './request'
import type { Character, Episode, Prop, Scene, SceneDetail, StartTaskResult } from './models'

/**
 * Assets resource (characters / scenes / props + extraction) — mirrors
 * apps/server/routes/assets.ts + asset-extraction-service.ts.
 */

export interface GenericLink {
  id: string
  projectId: string
  episodeId: string
  usageType: string
  createdAt: string
  updatedAt: string
}

/** GET /api/episodes/:id/assets → { episode, characters, scenes, props } (each with its link). */
export interface EpisodeAssets {
  episode: Episode
  characters: Array<{ link: GenericLink; character: Character }>
  scenes: Array<{ link: GenericLink; scene: Scene }>
  props: Array<{ link: GenericLink; prop: Prop }>
}

export function fetchEpisodeAssets(episodeId: string, signal?: AbortSignal): Promise<EpisodeAssets> {
  return get(`/episodes/${episodeId}/assets`, { signal })
}

export interface ExtractAssetsPayload {
  options?: Record<string, unknown>
}

/** POST /api/episodes/:id/extract-assets[?force=true] → 202 { taskId, status }. */
export function extractAssets(
  episodeId: string,
  payload: ExtractAssetsPayload = {},
  force = false,
): Promise<StartTaskResult> {
  return post(`/episodes/${episodeId}/extract-assets${force ? '?force=true' : ''}`, payload)
}

/** GET /api/projects/:id/characters → { project, characters }. */
export function fetchProjectCharacters(projectId: string, signal?: AbortSignal): Promise<Character[]> {
  return get<{ characters: Character[] }>(`/projects/${projectId}/characters`, { signal }).then(
    (d) => d.characters,
  )
}

/** GET /api/characters/:id → { character }. */
export function fetchCharacter(characterId: string, signal?: AbortSignal): Promise<Character> {
  return get<{ character: Character }>(`/characters/${characterId}`, { signal }).then((d) => d.character)
}

/** GET /api/projects/:id/scenes → { project, scenes }. */
export function fetchProjectScenes(projectId: string, signal?: AbortSignal): Promise<Scene[]> {
  return get<{ scenes: Scene[] }>(`/projects/${projectId}/scenes`, { signal }).then((d) => d.scenes)
}

/** GET /api/scenes/:id → { scene }. */
export function fetchScene(sceneId: string, signal?: AbortSignal): Promise<SceneDetail> {
  return get<{ scene: SceneDetail }>(`/scenes/${sceneId}`, { signal }).then((d) => d.scene)
}

/** GET /api/projects/:id/props → { project, props }. */
export function fetchProjectProps(projectId: string, signal?: AbortSignal): Promise<Prop[]> {
  return get<{ props: Prop[] }>(`/projects/${projectId}/props`, { signal }).then((d) => d.props)
}
