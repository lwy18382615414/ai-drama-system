import { Hono } from 'hono'
import type { Context } from 'hono'
import type { DatabaseClient } from '../../../packages/database/index.js'
import type { StructuredTextProvider } from '../../../packages/providers/index.js'
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
}

export function createEpisodePlannerRoutes(deps: EpisodePlannerRouteDeps) {
  const app = new Hono()

  app.post('/api/projects/:projectId/plan-episodes', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const parsed = StartEpisodePlanningRequestSchema.safeParse(body ?? {})

    if (!parsed.success) {
      return c.json({ error: 'Invalid request body', issues: parsed.error.issues }, 400)
    }

    try {
      const result = await startEpisodePlanning(deps, c.req.param('projectId'), parsed.data)
      return c.json(result, 202)
    } catch (error) {
      return handleServiceError(c, error)
    }
  })

  app.get('/api/projects/:projectId/episodes', async (c) => {
    const episodes = await getProjectEpisodes(deps.db, c.req.param('projectId'))

    if (!episodes) {
      return c.json({ error: 'Project not found' }, 404)
    }

    return c.json({ episodes })
  })

  app.get('/api/episodes/:episodeId/events', async (c) => {
    const result = await getEpisodeEvents(deps.db, c.req.param('episodeId'))

    if (!result) {
      return c.json({ error: 'Episode not found' }, 404)
    }

    return c.json(result)
  })

  return app
}

function handleServiceError(c: Context, error: unknown) {
  if (error instanceof EpisodePlannerServiceError) {
    return c.json({ error: error.message }, error.statusCode as 400 | 404 | 409)
  }

  if (error instanceof Error) {
    return c.json({ error: error.message }, 500)
  }

  return c.json({ error: String(error) }, 500)
}
