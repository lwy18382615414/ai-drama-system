import { Hono } from 'hono'
import type { DatabaseClient } from '../../../packages/database/index.js'
import type { StructuredTextProvider } from '../../../packages/providers/index.js'
import { invalidRequestBody, notFound, ok } from '../api-response.js'
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
      return invalidRequestBody(c, parsed.error.issues)
    }

    const result = await startEventExtraction(deps, parsed.data)

    return ok(c, result, 202)
  })

  app.get('/status/:taskId', async (c) => {
    const task = await getEventExtractionStatus(deps.db, c.req.param('taskId'))

    if (!task) {
      return notFound(c, 'Task not found')
    }

    return ok(c, { task })
  })

  app.get('/result/:chapterId', async (c) => {
    const events = await getChapterEvents(deps.db, c.req.param('chapterId'))

    return ok(c, { events })
  })

  return app
}
