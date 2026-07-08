import { asc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import {
  batches,
  createDatabase,
  initializeDatabase,
  novelChapters,
  novelEvents,
  projects,
  type DatabaseClient,
} from '../../../packages/database/index.js'
import { MockStructuredTextProvider } from '../../../packages/providers/index.js'
import { startTestWorker } from '../test-helpers/task-worker.js'
import { createProjectRoutes } from './project.js'

interface ApiResponse<T> {
  code: number
  message: string
  data: T
}

async function createTestApp() {
  const db = await createDatabase(':memory:')
  await initializeDatabase(db)
  const provider = new MockStructuredTextProvider()
  const worker = startTestWorker(db, { provider })
  const app = new Hono()
  app.route('/', createProjectRoutes({ db, provider, scheduler: worker }))
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
      status: statuses[no] ?? 'event_extracted',
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

function deleteRequest(chapterIds: string[]) {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chapterIds }),
  }
}

async function chapterNos(db: DatabaseClient) {
  const rows = await db
    .select({ id: novelChapters.id, chapterNo: novelChapters.chapterNo })
    .from(novelChapters)
    .where(eq(novelChapters.projectId, 'p1'))
    .orderBy(asc(novelChapters.chapterNo))
  return rows.map((row) => `${row.id}:${row.chapterNo}`)
}

describe('POST /api/projects/:projectId/chapters/delete', () => {
  it('deletes unplanned chapters with their events and renumbers the surviving tail', async () => {
    const { app, db } = await createTestApp()
    await seed(db, 5)
    await seedBatch(db, 1, 2)

    const res = await app.request('/api/projects/p1/chapters/delete', deleteRequest(['c3', 'c4']))

    expect(res.status).toBe(200)
    const { data } = (await res.json()) as ApiResponse<{ deletedCount: number }>
    expect(data.deletedCount).toBe(2)

    // c5 moves up to fill the gap: planned 1-2 untouched, tail renumbered contiguously.
    expect(await chapterNos(db)).toEqual(['c1:1', 'c2:2', 'c5:3'])

    const orphanEvents = await db.select().from(novelEvents).where(eq(novelEvents.chapterId, 'c3'))
    expect(orphanEvents).toHaveLength(0)
  })

  it('rejects the whole request when a planned chapter is included and deletes nothing', async () => {
    const { app, db } = await createTestApp()
    await seed(db, 4)
    await seedBatch(db, 1, 2)

    const res = await app.request('/api/projects/p1/chapters/delete', deleteRequest(['c2', 'c3']))

    expect(res.status).toBe(200)
    const body = (await res.json()) as ApiResponse<null>
    expect(body.code).toBe(40901)
    expect(body.message).toContain('第2章')

    expect(await chapterNos(db)).toEqual(['c1:1', 'c2:2', 'c3:3', 'c4:4'])
  })

  it('rejects chapters currently extracting', async () => {
    const { app, db } = await createTestApp()
    await seed(db, 3, { 3: 'event_extracting' })

    const res = await app.request('/api/projects/p1/chapters/delete', deleteRequest(['c3']))

    expect(res.status).toBe(200)
    const body = (await res.json()) as ApiResponse<null>
    expect(body.code).toBe(40901)
    expect(body.message).toContain('第3章')
  })

  it('rejects unknown chapter ids with InvalidRequestBody (40001)', async () => {
    const { app, db } = await createTestApp()
    await seed(db, 2)

    const res = await app.request('/api/projects/p1/chapters/delete', deleteRequest(['c1', 'nope']))

    expect(res.status).toBe(200)
    const body = (await res.json()) as ApiResponse<null>
    expect(body.code).toBe(40001)
    expect(await chapterNos(db)).toEqual(['c1:1', 'c2:2'])
  })

  it('reports NotFound (40401) for a missing project', async () => {
    const { app } = await createTestApp()

    const res = await app.request('/api/projects/missing/chapters/delete', deleteRequest(['c1']))

    expect(res.status).toBe(200)
    const body = (await res.json()) as ApiResponse<null>
    expect(body.code).toBe(40401)
  })

  it('deletes every chapter when none are planned', async () => {
    const { app, db } = await createTestApp()
    await seed(db, 3)

    const res = await app.request('/api/projects/p1/chapters/delete', deleteRequest(['c1', 'c2', 'c3']))

    expect(res.status).toBe(200)
    expect(await chapterNos(db)).toEqual([])
  })
})
