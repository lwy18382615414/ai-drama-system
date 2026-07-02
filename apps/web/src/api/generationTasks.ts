import { apiClient } from '@/api/client'

export interface GenerationTask {
  id: string
  projectId: string
  episodeId: string | null
  storyboardId: string | null
  targetType: string | null
  targetId: string | null
  taskType: string
  provider: string | null
  model: string | null
  inputJson: string | null
  outputJson: string | null
  status: string
  retryCount: number
  errorMessage: string | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export async function getGenerationTask(taskId: string): Promise<GenerationTask> {
  const { data } = await apiClient.get<{ task: GenerationTask }>(`/generation-tasks/${taskId}`)
  return data.task
}
