import { Hono } from 'hono'
import type { Context } from 'hono'
import type { DatabaseClient } from '../../../packages/database/index.js'
import type { StructuredTextProvider } from '../../../packages/providers/index.js'
import type { TaskScheduler } from '../../../packages/tasks/index.js'
import {
  fail,
  internalError,
  invalidRequestBody,
  notFound,
  ok,
  serviceErrorCode,
  unprocessable,
} from '../api-response.js'
import {
  CreateBatchRequestSchema,
  EpisodePlannerServiceError,
  getEpisodeEvents,
  getProjectBatches,
  getProjectEpisodes,
  startBatchPlanning,
  startBatchReplan,
} from '../services/episode-planner-service.js'

export interface EpisodePlannerRouteDeps {
  db: DatabaseClient
  provider: StructuredTextProvider
  scheduler: TaskScheduler
}

export function createEpisodePlannerRoutes(deps: EpisodePlannerRouteDeps) {
  const app = new Hono()

  app.get('/api/projects/:projectId/batches', async (c) => {
    const batches = await getProjectBatches(deps.db, c.req.param('projectId'))

    if (!batches) {
      return notFound(c, 'Project not found')
    }

    return ok(c, { batches })
  })

  app.post('/api/projects/:projectId/batches', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const parsed = CreateBatchRequestSchema.safeParse(body ?? {})

    if (!parsed.success) {
      return invalidRequestBody(c, parsed.error.issues)
    }

    try {
      const result = await startBatchPlanning(deps, c.req.param('projectId'), parsed.data)
      return ok(c, result, 202)
    } catch (error) {
      return handleServiceError(c, error)
    }
  })

  app.post('/api/projects/:projectId/batches/:batchId/replan', async (c) => {
    try {
      const result = await startBatchReplan(deps, c.req.param('projectId'), c.req.param('batchId'))
      return ok(c, result, 202)
    } catch (error) {
      return handleServiceError(c, error)
    }
  })

  app.get('/api/projects/:projectId/episodes', async (c) => {
    const episodes = await getProjectEpisodes(deps.db, c.req.param('projectId'))

    if (!episodes) {
      return notFound(c, 'Project not found')
    }

    return ok(c, { episodes })
  })

  app.get('/api/episodes/:episodeId/events', async (c) => {
    const result = await getEpisodeEvents(deps.db, c.req.param('episodeId'))

    if (!result) {
      return notFound(c, 'Episode not found')
    }

    return ok(c, result)
  })

  return app
}

function handleServiceError(c: Context, error: unknown) {
  if (error instanceof EpisodePlannerServiceError) {
    if (error.statusCode === 422) {
      return unprocessable(c, error.message, error.data)
    }

    return fail(c, serviceErrorCode(error.statusCode), error.message, error.statusCode as 400 | 404 | 409)
  }

  return internalError(c, error)
}
