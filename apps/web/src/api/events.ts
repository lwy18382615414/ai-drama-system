import { get, post } from './request'
import type { GenerationTask, NovelEvent, StartTaskResult } from './models'

/**
 * Event-agent resource — mirrors apps/server/routes/event-agent.ts
 * (mounted at /api/agents/event) + event-agent-service.ts.
 */

export interface StartEventExtractionPayload {
  projectId: string
  chapterId: string
  options?: Record<string, unknown>
}

export interface StartBatchEventExtractionPayload {
  projectId: string
  chapterIds: string[]
  options?: Record<string, unknown>
}

export interface BatchExtractionSkip {
  chapterId: string
  reason: 'planned' | 'extracting'
}

export interface BatchEventExtractionResult {
  tasks: Array<{ taskId: string; chapterId: string }>
  skipped: BatchExtractionSkip[]
}

/** POST /api/agents/event/extract → 202 { taskId, status }. */
export function startEventExtraction(payload: StartEventExtractionPayload): Promise<StartTaskResult> {
  return post('/agents/event/extract', payload)
}

/** POST /api/agents/event/extract-batch → 202 { tasks, skipped }. */
export function startBatchEventExtraction(
  payload: StartBatchEventExtractionPayload,
): Promise<BatchEventExtractionResult> {
  return post('/agents/event/extract-batch', payload)
}

/** GET /api/agents/event/status/:taskId → { task }. */
export function fetchEventExtractionStatus(taskId: string, signal?: AbortSignal): Promise<GenerationTask> {
  return get<{ task: GenerationTask }>(`/agents/event/status/${taskId}`, { signal }).then((d) => d.task)
}

/** GET /api/agents/event/result/:chapterId → { events }. */
export function fetchChapterEvents(chapterId: string, signal?: AbortSignal): Promise<NovelEvent[]> {
  return get<{ events: NovelEvent[] }>(`/agents/event/result/${chapterId}`, { signal }).then((d) => d.events)
}
