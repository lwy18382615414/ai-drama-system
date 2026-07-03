import { Hono } from 'hono'
import type { Context } from 'hono'
import { z } from 'zod/v4'
import type { DatabaseClient } from '../../../packages/database/index.js'
import type { StructuredTextProvider } from '../../../packages/providers/index.js'
import type { TaskScheduler } from '../../../packages/tasks/index.js'
import { fail, internalError, invalidQuery, invalidRequestBody, notFound, ok, serviceErrorCode } from '../api-response.js'
import {
  getEpisodeStoryboards,
  getStoryboard,
  PatchStoryboardRequestSchema,
  startStoryboardGeneration,
  StartStoryboardGenerationRequestSchema,
  StoryboardServiceError,
  updateStoryboard,
} from '../services/storyboard-service.js'

export interface StoryboardRouteDeps {
  db: DatabaseClient
  provider: StructuredTextProvider
  scheduler: TaskScheduler
}

export function createStoryboardRoutes(deps: StoryboardRouteDeps) {
  const app = new Hono()

  app.post('/api/episodes/:episodeId/generate-storyboards', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const forceQuery = parseForceQuery(c.req.query('force'))

    if (forceQuery === 'invalid') {
      return invalidQuery(c)
    }

    const requestBody = {
      ...(body ?? {}),
      ...(forceQuery === undefined ? {} : { force: forceQuery }),
    }
    const parsed = StartStoryboardGenerationRequestSchema.safeParse(requestBody)

    if (!parsed.success) {
      return invalidRequestBody(c, parsed.error.issues)
    }

    try {
      const result = await startStoryboardGeneration(deps, c.req.param('episodeId'), parsed.data)
      return ok(c, result, 202)
    } catch (error) {
      return handleServiceError(c, error)
    }
  })

  app.get('/api/episodes/:episodeId/storyboards', async (c) => {
    try {
      const result = await getEpisodeStoryboards(deps.db, c.req.param('episodeId'))

      if (!result) {
        return notFound(c, 'Episode not found')
      }

      return ok(c, result)
    } catch (error) {
      return handleServiceError(c, error)
    }
  })

  app.get('/api/storyboards/:storyboardId', async (c) => {
    try {
      const storyboard = await getStoryboard(deps.db, c.req.param('storyboardId'))

      if (!storyboard) {
        return notFound(c, 'Storyboard not found')
      }

      return ok(c, { storyboard })
    } catch (error) {
      return handleServiceError(c, error)
    }
  })

  app.patch('/api/storyboards/:storyboardId', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const parsed = PatchStoryboardRequestSchema.safeParse(body ?? {})

    if (!parsed.success) {
      return invalidRequestBody(c, parsed.error.issues)
    }

    try {
      const storyboard = await updateStoryboard(deps.db, c.req.param('storyboardId'), parsed.data)
      return ok(c, { storyboard })
    } catch (error) {
      return handleServiceError(c, error)
    }
  })

  return app
}

function parseForceQuery(value: string | undefined) {
  if (value === undefined) {
    return undefined
  }

  if (value === 'true' || value === '1') {
    return true
  }

  if (value === 'false' || value === '0') {
    return false
  }

  return 'invalid' as const
}

function handleServiceError(c: Context, error: unknown) {
  if (error instanceof StoryboardServiceError) {
    return fail(c, serviceErrorCode(error.statusCode), error.message, error.statusCode as 400 | 404 | 409)
  }

  if (error instanceof z.ZodError) {
    return invalidRequestBody(c, error.issues)
  }

  return internalError(c, error)
}
