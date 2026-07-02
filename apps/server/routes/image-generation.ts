import { Hono } from 'hono'
import type { Context } from 'hono'
import { z } from 'zod/v4'
import type { DatabaseClient } from '../../../packages/database/index.js'
import type { ImageProvider } from '../../../packages/providers/index.js'
import {
  BatchImageGenerationRequestSchema,
  generateAllEpisodeImages,
  generateEpisodeCharacterImages,
  generateEpisodeSceneImages,
  generateEpisodeStoryboardFirstFrames,
  getEpisodeImageGenerationStatus,
  getGenerationTask,
  getProjectAssets,
  ImageGenerationServiceError,
  startCharacterReferenceImageGeneration,
  startImageGeneration,
  startSceneReferenceImageGeneration,
  startStoryboardFirstFrameGeneration,
  StartCharacterReferenceImageRequestSchema,
  StartImageGenerationRequestSchema,
  StartSceneReferenceImageRequestSchema,
  StartStoryboardFirstFrameRequestSchema,
  type BatchImageGenerationRequest,
} from '../services/image-generation-service.js'

export interface ImageGenerationRouteDeps {
  db: DatabaseClient
  imageProvider: ImageProvider
}

export function createImageGenerationRoutes(deps: ImageGenerationRouteDeps) {
  const app = new Hono()

  app.post('/api/characters/:characterId/generate-image', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const forceQuery = parseForceQuery(c.req.query('force'))

    if (forceQuery === 'invalid') {
      return c.json({ error: 'Invalid force query parameter' }, 400)
    }

    const requestBody = {
      ...(body ?? {}),
      ...(forceQuery === undefined ? {} : { force: forceQuery }),
    }
    const parsed = StartCharacterReferenceImageRequestSchema.safeParse(requestBody)

    if (!parsed.success) {
      return c.json({ error: 'Invalid request body', issues: parsed.error.issues }, 400)
    }

    try {
      const result = await startCharacterReferenceImageGeneration(deps, c.req.param('characterId'), parsed.data)
      return c.json(result, 202)
    } catch (error) {
      return handleServiceError(c, error)
    }
  })

  app.post('/api/scenes/:sceneId/generate-image', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const forceQuery = parseForceQuery(c.req.query('force'))

    if (forceQuery === 'invalid') {
      return c.json({ error: 'Invalid force query parameter' }, 400)
    }

    const requestBody = {
      ...(body ?? {}),
      ...(forceQuery === undefined ? {} : { force: forceQuery }),
    }
    const parsed = StartSceneReferenceImageRequestSchema.safeParse(requestBody)

    if (!parsed.success) {
      return c.json({ error: 'Invalid request body', issues: parsed.error.issues }, 400)
    }

    try {
      const result = await startSceneReferenceImageGeneration(deps, c.req.param('sceneId'), parsed.data)
      return c.json(result, 202)
    } catch (error) {
      return handleServiceError(c, error)
    }
  })

  app.post('/api/storyboards/:storyboardId/generate-first-frame', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const forceQuery = parseForceQuery(c.req.query('force'))

    if (forceQuery === 'invalid') {
      return c.json({ error: 'Invalid force query parameter' }, 400)
    }

    const requestBody = {
      ...(body ?? {}),
      ...(forceQuery === undefined ? {} : { force: forceQuery }),
    }
    const parsed = StartStoryboardFirstFrameRequestSchema.safeParse(requestBody)

    if (!parsed.success) {
      return c.json({ error: 'Invalid request body', issues: parsed.error.issues }, 400)
    }

    try {
      const result = await startStoryboardFirstFrameGeneration(deps, c.req.param('storyboardId'), parsed.data)
      return c.json(result, 202)
    } catch (error) {
      return handleServiceError(c, error)
    }
  })

  app.post('/api/projects/:projectId/generate-image', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const forceQuery = parseForceQuery(c.req.query('force'))

    if (forceQuery === 'invalid') {
      return c.json({ error: 'Invalid force query parameter' }, 400)
    }

    const requestBody = {
      ...(body ?? {}),
      ...(forceQuery === undefined ? {} : { force: forceQuery }),
    }
    const parsed = StartImageGenerationRequestSchema.safeParse(requestBody)

    if (!parsed.success) {
      return c.json({ error: 'Invalid request body', issues: parsed.error.issues }, 400)
    }

    try {
      const result = await startImageGeneration(deps, c.req.param('projectId'), parsed.data)
      return c.json(result, 202)
    } catch (error) {
      return handleServiceError(c, error)
    }
  })

  app.post('/api/episodes/:episodeId/generate-character-images', async (c) => {
    const parsed = await parseBatchRequest(c)
    if ('response' in parsed) return parsed.response

    try {
      const result = await generateEpisodeCharacterImages(deps, c.req.param('episodeId'), parsed.data)
      return c.json(result, 200)
    } catch (error) {
      return handleServiceError(c, error)
    }
  })

  app.post('/api/episodes/:episodeId/generate-scene-images', async (c) => {
    const parsed = await parseBatchRequest(c)
    if ('response' in parsed) return parsed.response

    try {
      const result = await generateEpisodeSceneImages(deps, c.req.param('episodeId'), parsed.data)
      return c.json(result, 200)
    } catch (error) {
      return handleServiceError(c, error)
    }
  })

  app.post('/api/episodes/:episodeId/generate-storyboard-first-frames', async (c) => {
    const parsed = await parseBatchRequest(c)
    if ('response' in parsed) return parsed.response

    try {
      const result = await generateEpisodeStoryboardFirstFrames(deps, c.req.param('episodeId'), parsed.data)
      return c.json(result, 200)
    } catch (error) {
      return handleServiceError(c, error)
    }
  })

  app.post('/api/episodes/:episodeId/generate-all-images', async (c) => {
    const parsed = await parseBatchRequest(c)
    if ('response' in parsed) return parsed.response

    try {
      const result = await generateAllEpisodeImages(deps, c.req.param('episodeId'), parsed.data)
      return c.json(result, 200)
    } catch (error) {
      return handleServiceError(c, error)
    }
  })

  app.get('/api/episodes/:episodeId/image-generation-status', async (c) => {
    try {
      const result = await getEpisodeImageGenerationStatus(deps.db, c.req.param('episodeId'))

      if (!result) {
        return c.json({ error: 'Episode not found' }, 404)
      }

      return c.json(result)
    } catch (error) {
      return handleServiceError(c, error)
    }
  })

  app.get('/api/generation-tasks/:taskId', async (c) => {
    try {
      const task = await getGenerationTask(deps.db, c.req.param('taskId'))

      if (!task) {
        return c.json({ error: 'Generation task not found' }, 404)
      }

      return c.json({ task })
    } catch (error) {
      return handleServiceError(c, error)
    }
  })

  app.get('/api/projects/:projectId/assets', async (c) => {
    try {
      const result = await getProjectAssets(deps.db, c.req.param('projectId'))

      if (!result) {
        return c.json({ error: 'Project not found' }, 404)
      }

      return c.json(result)
    } catch (error) {
      return handleServiceError(c, error)
    }
  })

  return app
}

async function parseBatchRequest(
  c: Context,
): Promise<{ data: BatchImageGenerationRequest } | { response: Response }> {
  const body = await c.req.json().catch(() => ({}))
  const forceQuery = parseForceQuery(c.req.query('force'))

  if (forceQuery === 'invalid') {
    return { response: c.json({ error: 'Invalid force query parameter' }, 400) }
  }

  const requestBody = {
    ...(body ?? {}),
    ...(forceQuery === undefined ? {} : { force: forceQuery }),
  }
  const parsed = BatchImageGenerationRequestSchema.safeParse(requestBody)

  if (!parsed.success) {
    return { response: c.json({ error: 'Invalid request body', issues: parsed.error.issues }, 400) }
  }

  return { data: parsed.data }
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
  if (error instanceof ImageGenerationServiceError) {
    return c.json({ error: error.message }, error.statusCode as 400 | 404 | 409)
  }

  if (error instanceof z.ZodError) {
    return c.json({ error: 'Invalid request body', issues: error.issues }, 400)
  }

  if (error instanceof Error) {
    return c.json({ error: error.message }, 500)
  }

  return c.json({ error: String(error) }, 500)
}
