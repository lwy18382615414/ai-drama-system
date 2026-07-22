import { get, post, patch } from './request'
import type { Episode, Script, StartTaskResult } from './models'

/**
 * Script resource — mirrors apps/server/routes/script.ts + script-service.ts.
 */

/** GET /api/episodes/:id/script → { episode, script | null } (null = not generated yet). */
export function fetchEpisodeScript(
  episodeId: string,
  signal?: AbortSignal,
): Promise<{ episode: Episode; script: Script | null }> {
  return get(`/episodes/${episodeId}/script`, { signal })
}

export interface GenerateScriptPayload {
  options?: Record<string, unknown>
}

/** POST /api/episodes/:id/generate-script[?force=true] → 202 { taskId, status }. */
export function generateScript(
  episodeId: string,
  payload: GenerateScriptPayload = {},
  force = false,
): Promise<StartTaskResult> {
  return post(`/episodes/${episodeId}/generate-script${force ? '?force=true' : ''}`, payload)
}

/** PATCH body — snake_case, mirrors PatchScriptRequestSchema. */
export type PatchScriptPayload = Partial<{
  title: string
  summary: string
  opening_hook: string | null
  ending_hook: string | null
  content: string
  structured_json: unknown
  status: string
}>

/** PATCH /api/scripts/:id → { script }. Edits invalidate downstream assets/storyboards/images. */
export function updateScript(scriptId: string, payload: PatchScriptPayload): Promise<Script> {
  return patch<{ script: Script }>(`/scripts/${scriptId}`, payload).then((d) => d.script)
}
