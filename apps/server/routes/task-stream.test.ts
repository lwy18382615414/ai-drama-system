import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import {
  createDatabase,
  generationTasks,
  initializeDatabase,
  projects,
  type DatabaseClient,
} from '../../../packages/database/index.js'
import { startTestWorker } from '../test-helpers/task-worker.js'
import { createTaskStreamRoutes } from './task-stream.js'

async function createTestApp() {
  const db = await createDatabase(':memory:')
  await initializeDatabase(db)
  const now = new Date().toISOString()
  await db.insert(projects).values({ id: 'project-1', title: 'Stream test', createdAt: now, updatedAt: now })

  const worker = startTestWorker(db)
  const app = new Hono()
  app.route('/', createTaskStreamRoutes({ db, bus: worker }))
  return { app, db }
}

async function insertPendingTask(db: DatabaseClient, id: string) {
  const now = new Date().toISOString()
  await db.insert(generationTasks).values({
    id,
    projectId: 'project-1',
    taskType: 'event_extraction',
    inputJson: '{}',
    status: 'pending',
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
  })
}

/** Reads from the SSE body until `marker` appears in the decoded text, or a read budget is hit. */
async function readUntil(reader: ReadableStreamDefaultReader<Uint8Array>, marker: string) {
  const decoder = new TextDecoder()
  let text = ''
  for (let i = 0; i < 20; i += 1) {
    const { value, done } = await reader.read()
    if (value) text += decoder.decode(value, { stream: true })
    if (text.includes(marker)) return text
    if (done) break
  }
  return text
}

describe('task stream SSE route', () => {
  it('reports NotFound (40401) for an unknown project', async () => {
    const { app } = await createTestApp()
    const res = await app.request('/api/projects/missing/tasks/stream')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { code: number }
    expect(body.code).toBe(40401)
  })

  it('pushes a snapshot event on connect containing recoverable tasks', async () => {
    const { app, db } = await createTestApp()
    await insertPendingTask(db, 'task-1')

    const controller = new AbortController()
    const res = await app.request('/api/projects/project-1/tasks/stream', { signal: controller.signal })

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')

    const reader = res.body!.getReader()
    const text = await readUntil(reader, 'task-1')

    expect(text).toContain('event: snapshot')
    const dataLine = text.split('\n').find((line) => line.startsWith('data:'))
    expect(dataLine).toBeDefined()
    const payload = JSON.parse(dataLine!.slice('data:'.length).trim())
    expect(payload.tasks.map((t: { taskId: string }) => t.taskId)).toContain('task-1')

    controller.abort()
    await reader.cancel().catch(() => {})
  })
})
