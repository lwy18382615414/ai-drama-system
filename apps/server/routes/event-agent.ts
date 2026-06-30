import { Hono } from 'hono'
import type { DatabaseClient } from '../../../packages/database/index.js'
import type { StructuredTextProvider } from '../../../packages/providers/index.js'
import {
  getChapterEvents,
  getEventExtractionStatus,
  startEventExtraction,
  StartEventExtractionRequestSchema,
} from '../services/event-agent-service.js'

export interface EventAgentRouteDeps {
  db: DatabaseClient
  provider: StructuredTextProvider
}

export function createEventAgentRoutes(deps: EventAgentRouteDeps) {
  const app = new Hono()

  app.post('/extract', async (c) => {
    const body = await c.req.json().catch(() => null)
    const parsed = StartEventExtractionRequestSchema.safeParse(body)

    if (!parsed.success) {
      return c.json({ error: 'Invalid request body', issues: parsed.error.issues }, 400)
    }

    const result = await startEventExtraction(deps, parsed.data)

    return c.json(result, 202)
  })

  app.get('/status/:taskId', async (c) => {
    const task = await getEventExtractionStatus(deps.db, c.req.param('taskId'))

    if (!task) {
      return c.json({ error: 'Task not found' }, 404)
    }

    return c.json({ task })
  })

  app.get('/result/:chapterId', async (c) => {
    const events = await getChapterEvents(deps.db, c.req.param('chapterId'))

    return c.json({ events })
  })

  return app
}
