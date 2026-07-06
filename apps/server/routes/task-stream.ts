import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { streamSSE, type SSEMessage } from 'hono/streaming'
import type { DatabaseClient } from '../../../packages/database/index.js'
import { projects } from '../../../packages/database/index.js'
import type { TaskEventBus } from '../../../packages/tasks/index.js'
import { notFound } from '../api-response.js'
import { listRecoverableTasks } from '../services/task-stream-service.js'

export interface TaskStreamRouteDeps {
  db: DatabaseClient
  bus: TaskEventBus
}

/** How often to emit a comment-less `ping` event so proxies keep the idle connection open. */
const HEARTBEAT_MS = 15_000

export function createTaskStreamRoutes(deps: TaskStreamRouteDeps) {
  const app = new Hono()

  // Server-Sent Events: pushes task lifecycle updates for a project. On (re)connect the client
  // first receives a `snapshot` event rebuilding its state from the database, then `task` events
  // as tasks change status. This makes page refresh / reconnection recover automatically.
  app.get('/api/projects/:projectId/tasks/stream', async (c) => {
    const projectId = c.req.param('projectId')

    const [project] = await deps.db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1)

    if (!project) {
      return notFound(c, 'Project not found')
    }

    return streamSSE(c, async (stream) => {
      const queue: SSEMessage[] = []
      let notify: (() => void) | null = null
      const push = (message: SSEMessage) => {
        queue.push(message)
        const resume = notify
        notify = null
        resume?.()
      }

      // Snapshot first: active tasks + recently settled ones, so a reconnecting client can
      // reconcile anything it missed while disconnected.
      const snapshot = await listRecoverableTasks(deps.db, projectId)
      push({ event: 'snapshot', data: JSON.stringify({ tasks: snapshot }) })

      const unsubscribe = deps.bus.subscribe(projectId, (event) => {
        push({ event: 'task', id: event.updatedAt, data: JSON.stringify(event) })
      })

      stream.onAbort(() => {
        unsubscribe()
        const resume = notify
        notify = null
        resume?.()
      })

      try {
        while (!stream.aborted) {
          // Arm the wakeup before checking the queue to avoid a lost-wakeup race with push().
          const activity = new Promise<void>((resolve) => {
            notify = resolve
          })
          if (queue.length === 0) {
            await Promise.race([activity, stream.sleep(HEARTBEAT_MS)])
          }
          notify = null

          if (stream.aborted) break

          if (queue.length === 0) {
            // Woke on the heartbeat interval with nothing to send: keep the connection warm.
            await stream.writeSSE({ event: 'ping', data: '' })
            continue
          }

          while (queue.length > 0 && !stream.aborted) {
            await stream.writeSSE(queue.shift()!)
          }
        }
      } finally {
        unsubscribe()
      }
    })
  })

  return app
}
