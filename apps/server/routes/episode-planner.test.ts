import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import {
  batches,
  createDatabase,
  generationTasks,
  initializeDatabase,
  novelChapters,
  novelEvents,
  projects,
  type DatabaseClient,
} from '../../../packages/database/index.js'
import { MockStructuredTextProvider } from '../../../packages/providers/index.js'
import { startTestWorker } from '../test-helpers/task-worker.js'
import { createEpisodePlannerRoutes } from './episode-planner.js'

interface ApiResponse<T> {
  code: number
  message: string
  data: T
}

/**
 * Plans every source event named in the request metadata into a single episode so the
 * coverage validator passes. The planner passes `metadata.sourceEventIds`.
 */
function coveringProvider() {
  return new MockStructuredTextProvider((request) => {
    const eventIds = Array.isArray(request.metadata?.sourceEventIds)
      ? request.metadata.sourceEventIds.map(String)
      : []
    return {
      episodes: [
        {
          title: '第1集',
          summary: '概要',
          opening_hook: '开场',
          ending_hook: '收尾',
          source_event_links: eventIds.map((id, index) => ({
            novel_event_id: id,
            order_in_episode: index + 1,
            usage_type: 'primary' as const,
          })),
        },
      ],
    }
  })
}

async function createTestApp() {
  const db = await createDatabase(':memory:')
  await initializeDatabase(db)
  const provider = coveringProvider()
  const worker = startTestWorker(db, { provider })
  const app = new Hono()
  app.route('/', createEpisodePlannerRoutes({ db, provider, scheduler: worker }))
  return { app, db }
}

async function seed(db: DatabaseClient, status: string) {
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
  for (let no = 1; no <= 3; no += 1) {
    await db.insert(novelChapters).values({
      id: `c${no}`,
      projectId: 'p1',
      chapterNo: no,
      title: `第${no}章`,
      content: '正文',
      wordCount: 2,
      source: 'manual_input',
      status,
      createdAt: now,
      updatedAt: now,
    })
    await db.insert(novelEvents).values({
      id: `e${no}`,
      projectId: 'p1',
      chapterId: `c${no}`,
      eventNo: 1,
      eventType: 'action',
      summary: `事件${no}`,
      detail: '细节',
      charactersJson: '[]',
      conflictLevel: 'low',
      importance: 'minor',
      createdAt: now,
      updatedAt: now,
    })
  }
}

async function waitForTask(db: DatabaseClient, taskId: string) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const [task] = await db.select().from(generationTasks).where(eq(generationTasks.id, taskId)).limit(1)
    if (task && task.status !== 'pending' && task.status !== 'running') return task
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error(`Task did not settle: ${taskId}`)
}

describe('episode planner routes', () => {
  it('POST /batches accepts, creates a batch, and the planning task completes', async () => {
    const { app, db } = await createTestApp()
    await seed(db, 'event_extracted')

    const res = await app.request('/api/projects/p1/batches', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chapterEndNo: 3 }),
    })
    expect(res.status).toBe(202)
    const body = (await res.json()) as ApiResponse<{ taskId: string; batchId: string; status: string }>
    expect(body.data.status).toBe('pending')
    expect(body.data.batchId).toBeTruthy()

    const task = await waitForTask(db, body.data.taskId)
    expect(task.status).toBe('completed')

    const listRes = await app.request('/api/projects/p1/batches')
    const listBody = (await listRes.json()) as ApiResponse<{ batches: Array<{ batchNo: number }> }>
    expect(listBody.data.batches).toHaveLength(1)
    expect(listBody.data.batches[0].batchNo).toBe(1)
  })

  it('POST /batches returns 422 when a selected chapter is not extracted', async () => {
    const { app, db } = await createTestApp()
    await seed(db, 'event_extracted')
    await db.update(novelChapters).set({ status: 'pending' }).where(eq(novelChapters.id, 'c2'))

    const res = await app.request('/api/projects/p1/batches', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chapterEndNo: 3 }),
    })
    expect(res.status).toBe(422)
    const body = (await res.json()) as ApiResponse<{ chapterNos: number[] }>
    expect(body.data.chapterNos).toEqual([2])
    // No batch was created for the rejected request.
    expect(await db.select().from(batches).where(eq(batches.projectId, 'p1'))).toHaveLength(0)
  })
})
