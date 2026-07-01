import { apiClient } from '@/api/client'
import type { NovelEvent } from '@/api/episodes'

interface RawNovelEventRow extends Omit<NovelEvent, 'characters'> {
  charactersJson: string
}

export interface EventExtractionTask {
  id: string
  status: string
  errorMessage: string | null
  createdAt: string
  completedAt: string | null
}

function parseCharactersJson(charactersJson: string): string[] {
  try {
    const parsed = JSON.parse(charactersJson)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

export async function extractEvents(
  projectId: string,
  chapterId: string,
): Promise<{ taskId: string; status: string }> {
  const { data } = await apiClient.post<{ taskId: string; status: string }>('/agents/event/extract', {
    projectId,
    chapterId,
  })
  return data
}

export async function getEventExtractionStatus(taskId: string): Promise<EventExtractionTask> {
  const { data } = await apiClient.get<{ task: EventExtractionTask }>(`/agents/event/status/${taskId}`)
  return data.task
}

export async function getChapterEvents(chapterId: string): Promise<NovelEvent[]> {
  const { data } = await apiClient.get<{ events: RawNovelEventRow[] }>(`/agents/event/result/${chapterId}`)
  return data.events.map(({ charactersJson, ...rest }) => ({
    ...rest,
    characters: parseCharactersJson(charactersJson),
  }))
}
