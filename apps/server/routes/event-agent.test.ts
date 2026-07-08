import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import {
  batches,
  createDatabase,
  generationTasks,
  initializeDatabase,
  novelChapters,
  projects,
  type DatabaseClient,
} from '../../../packages/database/index.js'
import { MockStructuredTextProvider } from '../../../packages/providers/index.js'
import { startTestWorker } from '../test-helpers/task-worker.js'
import { createEventAgentRoutes } from './event-agent.js'

interface ApiResponse<T> {
  code: number
  message: string
  data: T
}

interface BatchAck {
  tasks: Array<{ taskId: string; chapterId: string }>
  skipped: Array<{ chapterId: string; reason: string }>
}

async function createTestApp() {
  const db = await createDatabase(':memory:')
  await initializeDatabase(db)
  const provider = new MockStructuredTextProvider()
  // Serialize task execution: concurrent transactions on one in-memory libsql connection are flaky.
  const worker = startTestWorker(db, { provider, concurrency: 1 })
  const app = new Hono()
  app.route('/api/agents/event', createEventAgentRoutes({ db, provider, scheduler: worker }))
  return { app, db }
}

async function seed(db: DatabaseClient, chapterCount: number, statuses: Record<number, string> = {}) {
  const now = new Date().toISOString()
  await db.insert(projects).values({
    id: 'p1',
    title: 't',
    genre: 'drama',
    targetPlatform: 'short_video',
    visualStyle: 'realistic',
    episodeDuration: 60,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  })
  for (let no = 1; no <= chapterCount; no += 1) {
    await db.insert(novelChapters).values({
      id: `c${no}`,
      projectId: 'p1',
      chapterNo: no,
      title: `第${no}章`,
      content: '正文',
      wordCount: 2,
      source: 'paste',
      status: statuses[no] ?? 'pending',
      createdAt: now,
      updatedAt: now,
    })
  }
}

async function seedBatch(db: DatabaseClient, chapterStartNo: number, chapterEndNo: number) {
  const now = new Date().toISOString()
  await db.insert(batches).values({
    id: 'b1',
    projectId: 'p1',
    batchNo: 1,
    chapterStartNo,
    chapterEndNo,
    episodeStartNo: 1,
    episodeEndNo: 2,
    status: 'planned',
    createdAt: now,
    updatedAt: now,
  })
}

async function waitForTask(db: DatabaseClient, taskId: string) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const [task] = await db.select().from(generationTasks).where(eq(generationTasks.id, taskId)).limit(1)
    if (task && task.status !== 'pending' && task.status !== 'running') return task
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error(`Task did not settle: ${taskId}`)
}

function requestBody(chapterIds: string[]) {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectId: 'p1', chapterIds }),
  }
}

describe('POST /api/agents/event/extract-batch', () => {
  it('fans out one task per chapter (deduplicated) and each completes independently', async () => {
    const { app, db } = await createTestApp()
    await seed(db, 3)

    const res = await app.request('/api/agents/event/extract-batch', requestBody(['c1', 'c2', 'c1']))

    expect(res.status).toBe(202)
    const { data } = (await res.json()) as ApiResponse<BatchAck>
    expect(data.tasks).toHaveLength(2)
    expect(data.skipped).toHaveLength(0)
    expect(new Set(data.tasks.map((t) => t.chapterId))).toEqual(new Set(['c1', 'c2']))

    for (const { taskId, chapterId } of data.tasks) {
      const task = await waitForTask(db, taskId)
      expect(task.errorMessage).toBeNull()
      expect(task.status).toBe('completed')
      expect(task.taskType).toBe('event_extraction')
      expect(JSON.parse(task.inputJson).chapterId).toBe(chapterId)
    }

    const [chapter] = await db.select().from(novelChapters).where(eq(novelChapters.id, 'c1')).limit(1)
    expect(chapter.status).toBe('event_extracted')
  })

  it('rejects the whole request when any chapter id is unknown', async () => {
    const { app, db } = await createTestApp()
    await seed(db, 2)

    const res = await app.request('/api/agents/event/extract-batch', requestBody(['c1', 'missing']))

    expect(res.status).toBe(200)
    const body = (await res.json()) as ApiResponse<null>
    expect(body.code).toBe(40001)
    expect(body.message).toContain('missing')

    const rows = await db.select().from(generationTasks)
    expect(rows).toHaveLength(0)
  })

  it('skips planned and extracting chapters with reasons, enqueues the rest', async () => {
    const { app, db } = await createTestApp()
    await seed(db, 4, { 3: 'event_extracting' })
    await seedBatch(db, 1, 2)

    const res = await app.request('/api/agents/event/extract-batch', requestBody(['c1', 'c2', 'c3', 'c4']))

    expect(res.status).toBe(202)
    const { data } = (await res.json()) as ApiResponse<BatchAck>
    expect(data.tasks).toHaveLength(1)
    expect(data.tasks[0].chapterId).toBe('c4')
    expect(data.skipped).toEqual(
      expect.arrayContaining([
        { chapterId: 'c1', reason: 'planned' },
        { chapterId: 'c2', reason: 'planned' },
        { chapterId: 'c3', reason: 'extracting' },
      ]),
    )
    expect(data.skipped).toHaveLength(3)
  })

  it('skips chapters that already have a pending extraction task', async () => {
    const { app, db } = await createTestApp()
    await seed(db, 2)
    const now = new Date().toISOString()
    // Enqueued but unclaimed task for c1 (worker is only driven by notify() in tests).
    await db.insert(generationTasks).values({
      id: 'existing-task',
      projectId: 'p1',
      episodeId: null,
      storyboardId: null,
      taskType: 'event_extraction',
      provider: 'mock',
      model: 'mock-event-extractor-v1',
      inputJson: JSON.stringify({ projectId: 'p1', chapterId: 'c1', taskId: 'existing-task' }),
      outputJson: null,
      status: 'pending',
      retryCount: 0,
      errorMessage: null,
      startedAt: null,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    })

    const res = await app.request('/api/agents/event/extract-batch', requestBody(['c1', 'c2']))

    expect(res.status).toBe(202)
    const { data } = (await res.json()) as ApiResponse<BatchAck>
    expect(data.skipped).toEqual([{ chapterId: 'c1', reason: 'extracting' }])
    expect(data.tasks.map((t) => t.chapterId)).toEqual(['c2'])
  })
})
