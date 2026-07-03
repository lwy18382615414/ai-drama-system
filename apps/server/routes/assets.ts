import { Hono } from 'hono'
import type { Context } from 'hono'
import { z } from 'zod/v4'
import type { DatabaseClient } from '../../../packages/database/index.js'
import type { StructuredTextProvider } from '../../../packages/providers/index.js'
import type { TaskScheduler } from '../../../packages/tasks/index.js'
import { fail, internalError, invalidQuery, invalidRequestBody, notFound, ok, serviceErrorCode } from '../api-response.js'
import {
  AssetExtractionServiceError,
  getCharacter,
  getEpisodeAssets,
  getProjectCharacters,
  getProjectProps,
  getProjectScenes,
  getScene,
  startAssetExtraction,
  StartAssetExtractionRequestSchema,
} from '../services/asset-extraction-service.js'

export interface AssetRouteDeps {
  db: DatabaseClient
  provider: StructuredTextProvider
  scheduler: TaskScheduler
}

export function createAssetRoutes(deps: AssetRouteDeps) {
  const app = new Hono()

  app.post('/api/episodes/:episodeId/extract-assets', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const forceQuery = parseForceQuery(c.req.query('force'))

    if (forceQuery === 'invalid') {
      return invalidQuery(c)
    }

    const requestBody = {
      ...(body ?? {}),
      ...(forceQuery === undefined ? {} : { force: forceQuery }),
    }
    const parsed = StartAssetExtractionRequestSchema.safeParse(requestBody)

    if (!parsed.success) {
      return invalidRequestBody(c, parsed.error.issues)
    }

    try {
      const result = await startAssetExtraction(deps, c.req.param('episodeId'), parsed.data)
      return ok(c, result, 202)
    } catch (error) {
      return handleServiceError(c, error)
    }
  })

  app.get('/api/episodes/:episodeId/assets', async (c) => {
    try {
      const result = await getEpisodeAssets(deps.db, c.req.param('episodeId'))

      if (!result) {
        return notFound(c, 'Episode not found')
      }

      return ok(c, result)
    } catch (error) {
      return handleServiceError(c, error)
    }
  })

  app.get('/api/projects/:projectId/characters', async (c) => {
    try {
      const result = await getProjectCharacters(deps.db, c.req.param('projectId'))

      if (!result) {
        return notFound(c, 'Project not found')
      }

      return ok(c, result)
    } catch (error) {
      return handleServiceError(c, error)
    }
  })

  app.get('/api/characters/:characterId', async (c) => {
    try {
      const result = await getCharacter(deps.db, c.req.param('characterId'))

      if (!result) {
        return notFound(c, 'Character not found')
      }

      return ok(c, result)
    } catch (error) {
      return handleServiceError(c, error)
    }
  })

  app.get('/api/projects/:projectId/scenes', async (c) => {
    try {
      const result = await getProjectScenes(deps.db, c.req.param('projectId'))

      if (!result) {
        return notFound(c, 'Project not found')
      }

      return ok(c, result)
    } catch (error) {
      return handleServiceError(c, error)
    }
  })

  app.get('/api/scenes/:sceneId', async (c) => {
    try {
      const result = await getScene(deps.db, c.req.param('sceneId'))

      if (!result) {
        return notFound(c, 'Scene not found')
      }

      return ok(c, result)
    } catch (error) {
      return handleServiceError(c, error)
    }
  })

  app.get('/api/projects/:projectId/props', async (c) => {
    try {
      const result = await getProjectProps(deps.db, c.req.param('projectId'))

      if (!result) {
        return notFound(c, 'Project not found')
      }

      return ok(c, result)
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
  if (error instanceof AssetExtractionServiceError) {
    return fail(c, serviceErrorCode(error.statusCode), error.message, error.statusCode as 400 | 404 | 409)
  }

  if (error instanceof z.ZodError) {
    return invalidRequestBody(c, error.issues)
  }

  return internalError(c, error)
}
