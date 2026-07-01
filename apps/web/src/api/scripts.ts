import { apiClient } from '@/api/client'

export interface Script {
  id: string
  projectId: string
  episodeId: string
  title: string
  summary: string
  openingHook: string | null
  endingHook: string | null
  content: string
  structuredJson: string
  status: string
  createdAt: string
  updatedAt: string
}

export interface PatchScriptInput {
  title?: string
  summary?: string
  openingHook?: string | null
  endingHook?: string | null
  content?: string
  status?: string
}

export async function generateScript(
  episodeId: string,
  opts?: { force?: boolean },
): Promise<{ taskId: string; status: string }> {
  const { data } = await apiClient.post<{ taskId: string; status: string }>(
    `/episodes/${episodeId}/generate-script`,
    { force: opts?.force },
  )
  return data
}

/**
 * The backend 404s both when the episode is missing and when no script has been
 * generated yet (it doesn't distinguish the two in the response body), so this
 * always resolves to `null` in either case rather than throwing — callers should
 * fetch the episode separately (e.g. via listEpisodes) for header display.
 */
export async function getEpisodeScript(episodeId: string): Promise<Script | null> {
  try {
    const { data } = await apiClient.get<{ script: Script }>(`/episodes/${episodeId}/script`)
    return data.script
  } catch (error) {
    if (isNotFound(error)) return null
    throw error
  }
}

export async function updateScript(scriptId: string, patch: PatchScriptInput): Promise<Script> {
  const body = {
    title: patch.title,
    summary: patch.summary,
    opening_hook: patch.openingHook,
    ending_hook: patch.endingHook,
    content: patch.content,
    status: patch.status,
  }
  const { data } = await apiClient.patch<{ script: Script }>(`/scripts/${scriptId}`, body)
  return data.script
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    (error as { response?: { status?: number } }).response?.status === 404
  )
}
