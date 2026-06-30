import { Hono } from 'hono'
import type { Context } from 'hono'
import { z } from 'zod'
import type { DatabaseClient } from '../../../packages/database/index.js'
import type { StructuredTextProvider } from '../../../packages/providers/index.js'
import {
  getEpisodeScript,
  PatchScriptRequestSchema,
  ScriptServiceError,
  startScriptGeneration,
  StartScriptGenerationRequestSchema,
  updateScript,
} from '../services/script-service.js'

export interface ScriptRouteDeps {
  db: DatabaseClient
  provider: StructuredTextProvider
}

export function createScriptRoutes(deps: ScriptRouteDeps) {
  const app = new Hono()

  app.post('/api/episodes/:episodeId/generate-script', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const forceQuery = parseForceQuery(c.req.query('force'))

    if (forceQuery === 'invalid') {
      return c.json({ error: 'Invalid force query parameter' }, 400)
    }

    const requestBody = {
      ...(body ?? {}),
      ...(forceQuery === undefined ? {} : { force: forceQuery }),
    }
    const parsed = StartScriptGenerationRequestSchema.safeParse(requestBody)

    if (!parsed.success) {
      return c.json({ error: 'Invalid request body', issues: parsed.error.issues }, 400)
    }

    try {
      const result = await startScriptGeneration(deps, c.req.param('episodeId'), parsed.data)
      return c.json(result, 202)
    } catch (error) {
      return handleServiceError(c, error)
    }
  })

  app.get('/api/episodes/:episodeId/script', async (c) => {
    try {
      const result = await getEpisodeScript(deps.db, c.req.param('episodeId'))

      if (!result) {
        return c.json({ error: 'Episode not found' }, 404)
      }

      if (!result.script) {
        return c.json({ error: 'Script not found' }, 404)
      }

      return c.json(result)
    } catch (error) {
      return handleServiceError(c, error)
    }
  })

  app.patch('/api/scripts/:scriptId', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const parsed = PatchScriptRequestSchema.safeParse(body ?? {})

    if (!parsed.success) {
      return c.json({ error: 'Invalid request body', issues: parsed.error.issues }, 400)
    }

    try {
      const script = await updateScript(deps.db, c.req.param('scriptId'), parsed.data)
      return c.json({ script })
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
  if (error instanceof ScriptServiceError) {
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
