import { Hono } from 'hono'
import type { DatabaseClient } from '../../../packages/database/index.js'
import type { ImageProvider } from '../../../packages/providers/index.js'
import type { TaskScheduler } from '../../../packages/tasks/index.js'
import { handleServiceError, invalidQuery, invalidRequestBody, ok } from '../api-response.js'
import {
  CreateAppearanceVersionRequestSchema,
  UpdateAppearanceVersionRequestSchema,
  createAppearanceVersion,
  deleteAppearanceVersion,
  listAppearanceVersions,
  updateAppearanceVersion,
} from '../services/appearance-version-service.js'
import {
  StartCharacterReferenceImageRequestSchema,
  startAppearanceVersionImageGeneration,
} from '../services/image-generation-service.js'

export interface AppearanceVersionRouteDeps {
  db: DatabaseClient
  imageProvider: ImageProvider
  scheduler: TaskScheduler
}

export function createAppearanceVersionRoutes(deps: AppearanceVersionRouteDeps) {
  const app = new Hono()

  app.get('/api/characters/:characterId/appearance-versions', async (c) => {
    try {
      const result = await listAppearanceVersions(deps.db, c.req.param('characterId'))
      return ok(c, result)
    } catch (error) {
      return handleServiceError(c, error)
    }
  })

  app.post('/api/characters/:characterId/appearance-versions', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const parsed = CreateAppearanceVersionRequestSchema.safeParse(body)

    if (!parsed.success) {
      return invalidRequestBody(c, parsed.error.issues)
    }

    try {
      const version = await createAppearanceVersion(deps.db, c.req.param('characterId'), parsed.data)
      return ok(c, { version }, 201)
    } catch (error) {
      return handleServiceError(c, error)
    }
  })

  app.patch('/api/appearance-versions/:versionId', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const parsed = UpdateAppearanceVersionRequestSchema.safeParse(body)

    if (!parsed.success) {
      return invalidRequestBody(c, parsed.error.issues)
    }

    try {
      const version = await updateAppearanceVersion(deps.db, c.req.param('versionId'), parsed.data)
      return ok(c, { version })
    } catch (error) {
      return handleServiceError(c, error)
    }
  })

  app.delete('/api/appearance-versions/:versionId', async (c) => {
    try {
      await deleteAppearanceVersion(deps.db, c.req.param('versionId'))
      return ok(c, { deleted: true })
    } catch (error) {
      return handleServiceError(c, error)
    }
  })

  app.post('/api/appearance-versions/:versionId/generate-image', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const forceQuery = parseForceQuery(c.req.query('force'))

    if (forceQuery === 'invalid') {
      return invalidQuery(c)
    }

    const requestBody = {
      ...(body ?? {}),
      ...(forceQuery === undefined ? {} : { force: forceQuery }),
    }
    const parsed = StartCharacterReferenceImageRequestSchema.safeParse(requestBody)

    if (!parsed.success) {
      return invalidRequestBody(c, parsed.error.issues)
    }

    try {
      const result = await startAppearanceVersionImageGeneration(deps, c.req.param('versionId'), parsed.data)
      return ok(c, result, 202)
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
