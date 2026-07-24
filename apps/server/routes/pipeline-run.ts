import { Hono } from 'hono'
import type { DatabaseClient } from '../../../packages/database/index.js'
import type { StructuredTextProvider } from '../../../packages/providers/index.js'
import type { TaskScheduler } from '../../../packages/tasks/index.js'
import { handleServiceError, invalidRequestBody, ok } from '../api-response.js'
import {
  findActivePipelineRun,
  StartPipelineRunRequestSchema,
  startPipelineRun,
} from '../services/pipeline-run-service.js'

export interface PipelineRunRouteDeps {
  db: DatabaseClient
  provider: StructuredTextProvider
  scheduler: TaskScheduler
}

export function createPipelineRunRoutes(deps: PipelineRunRouteDeps) {
  const app = new Hono()

  // Start a one-click run over the next batch (extract → plan → script/assets/storyboards).
  app.post('/api/projects/:projectId/pipeline-run', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const parsed = StartPipelineRunRequestSchema.safeParse(body ?? {})
    if (!parsed.success) {
      return invalidRequestBody(c, parsed.error.issues)
    }

    try {
      const result = await startPipelineRun(deps, c.req.param('projectId'), parsed.data)
      return ok(c, result, 202)
    } catch (error) {
      return handleServiceError(c, error)
    }
  })

  // The project's currently-active run (for the frontend to reflect an in-progress one-click).
  app.get('/api/projects/:projectId/pipeline-run', async (c) => {
    try {
      const active = await findActivePipelineRun(deps.db, c.req.param('projectId'))
      return ok(c, { run: active ? { jobId: active.jobId, metadata: active.metadata } : null })
    } catch (error) {
      return handleServiceError(c, error)
    }
  })

  return app
}
