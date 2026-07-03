import { Hono } from 'hono'
import type { Context } from 'hono'
import type { DatabaseClient } from '../../../packages/database/index.js'
import type { StructuredTextProvider } from '../../../packages/providers/index.js'
import type { TaskScheduler } from '../../../packages/tasks/index.js'
import { fail, internalError, invalidRequestBody, notFound, ok, serviceErrorCode } from '../api-response.js'
import {
  EpisodePlannerServiceError,
  getEpisodeEvents,
  getProjectEpisodes,
  startEpisodePlanning,
  StartEpisodePlanningRequestSchema,
} from '../services/episode-planner-service.js'

export interface EpisodePlannerRouteDeps {
  db: DatabaseClient
  provider: StructuredTextProvider
  scheduler: TaskScheduler
}

export function createEpisodePlannerRoutes(deps: EpisodePlannerRouteDeps) {
  const app = new Hono()

  app.post('/api/projects/:projectId/plan-episodes', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const parsed = StartEpisodePlanningRequestSchema.safeParse(body ?? {})

    if (!parsed.success) {
      return invalidRequestBody(c, parsed.error.issues)
    }

    try {
      const result = await startEpisodePlanning(deps, c.req.param('projectId'), parsed.data)
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
    return fail(c, serviceErrorCode(error.statusCode), error.message, error.statusCode as 400 | 404 | 409)
  }

  return internalError(c, error)
}
