import { Hono } from 'hono'
import type { DatabaseClient } from '../../../packages/database/index.js'
import { handleServiceError, notFound, ok } from '../api-response.js'
import { computeEpisodePipelineStatus } from '../services/episode-pipeline-service.js'

export function createEpisodePipelineRoutes(deps: { db: DatabaseClient }) {
  const app = new Hono()
  app.get('/api/episodes/:episodeId/pipeline-status', async (c) => {
    try {
      const pipeline = await computeEpisodePipelineStatus(deps.db, c.req.param('episodeId'))
      return pipeline ? ok(c, { pipeline }) : notFound(c, 'Episode not found')
    } catch (error) {
      return handleServiceError(c, error)
    }
  })
  return app
}
