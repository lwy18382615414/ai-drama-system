import { get, post } from './request'

/**
 * One-click pipeline run — mirrors apps/server/routes/pipeline-run.ts
 * + pipeline-run-service.ts. Runs the next batch from event extraction through
 * script / assets / storyboards, stopping before any image generation.
 */

export type PipelineRunPhase = 'extracting' | 'planning' | 'producing' | 'done' | 'failed'

export interface PipelineRunMetadata {
  chapterStartNo: number
  chapterEndNo: number
  generateImages: boolean
  terminalStage: 'storyboards'
  batchId: string | null
  phase: PipelineRunPhase
  error?: string
}

export interface StartPipelineRunPayload {
  projectId: string
  chapterEndNo?: number
  generateImages?: boolean
}

export interface StartPipelineRunResult {
  jobId: string
  reused: boolean
}

export interface ActivePipelineRun {
  jobId: string
  metadata: PipelineRunMetadata
}

/** POST /api/projects/:projectId/pipeline-run → 202 { jobId, reused }. */
export function startPipelineRun(payload: StartPipelineRunPayload): Promise<StartPipelineRunResult> {
  const { projectId, ...body } = payload
  return post(`/projects/${projectId}/pipeline-run`, body)
}

/** GET /api/projects/:projectId/pipeline-run → { run: ActivePipelineRun | null }. */
export function fetchActivePipelineRun(
  projectId: string,
  signal?: AbortSignal,
): Promise<ActivePipelineRun | null> {
  return get<{ run: ActivePipelineRun | null }>(`/projects/${projectId}/pipeline-run`, { signal }).then(
    (d) => d.run,
  )
}
