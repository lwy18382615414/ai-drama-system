import { get, post, patch, del } from './request'
import type { SerializedAppearanceVersion, StartTaskResult } from './models'

/**
 * Character appearance versions — mirrors apps/server/routes/appearance-versions.ts
 * + appearance-version-service.ts.
 */

/** GET /api/characters/:id/appearance-versions → { characterId, versions }. */
export function fetchAppearanceVersions(
  characterId: string,
  signal?: AbortSignal,
): Promise<SerializedAppearanceVersion[]> {
  return get<{ characterId: string; versions: SerializedAppearanceVersion[] }>(
    `/characters/${characterId}/appearance-versions`,
    { signal },
  ).then((d) => d.versions)
}

export interface CreateAppearanceVersionPayload {
  appearance: string
  effectiveFromEpisodeNo: number
  changeReason?: string
}

/** POST /api/characters/:id/appearance-versions → { version }. */
export function createAppearanceVersion(
  characterId: string,
  payload: CreateAppearanceVersionPayload,
): Promise<SerializedAppearanceVersion> {
  return post<{ version: SerializedAppearanceVersion }>(
    `/characters/${characterId}/appearance-versions`,
    payload,
  ).then((d) => d.version)
}

export type UpdateAppearanceVersionPayload = Partial<{
  appearance: string
  changeReason: string | null
  effectiveFromEpisodeNo: number
}>

/** PATCH /api/appearance-versions/:id → { version }. */
export function updateAppearanceVersion(
  versionId: string,
  payload: UpdateAppearanceVersionPayload,
): Promise<SerializedAppearanceVersion> {
  return patch<{ version: SerializedAppearanceVersion }>(
    `/appearance-versions/${versionId}`,
    payload,
  ).then((d) => d.version)
}

/** DELETE /api/appearance-versions/:id → { deleted: true }. */
export function deleteAppearanceVersion(versionId: string): Promise<{ deleted: boolean }> {
  return del(`/appearance-versions/${versionId}`)
}

/** POST /api/appearance-versions/:id/generate-image[?force=true] → 202 { taskId, status }. */
export function generateAppearanceVersionImage(
  versionId: string,
  payload: { options?: Record<string, unknown> } = {},
  force = false,
): Promise<StartTaskResult> {
  return post(`/appearance-versions/${versionId}/generate-image${force ? '?force=true' : ''}`, payload)
}
