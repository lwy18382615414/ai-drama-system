import { eq } from 'drizzle-orm'
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
import {
  EpisodePlannerServiceError,
  startBatchPlanning,
  type EpisodePlannerServiceDeps,
} from './episode-planner-service.js'

/** A scheduler that records notify() calls without running any worker. */
function stubScheduler() {
  let notifications = 0
  return {
    notify() {
      notifications += 1
    },
    get count() {
      return notifications
    },
  }
}

function makeDeps(db: DatabaseClient): EpisodePlannerServiceDeps & { scheduler: ReturnType<typeof stubScheduler> } {
  const provider = new MockStructuredTextProvider(() => ({ episodes: [] }))
  const scheduler = stubScheduler()
  return { db, provider, scheduler }
}

async function seedProject(db: DatabaseClient) {
  const now = new Date().toISOString()
  await db.insert(projects).values({
    id: 'p1',
    title: '测试项目',
    genre: 'drama',
    targetPlatform: 'short_video',
    visualStyle: 'realistic',
    episodeDuration: 60,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  })
}

/** Insert `count` chapters (chapterNo 1..count). Each chapter gets one novel event. */
async function seedChapters(
  db: DatabaseClient,
  count: number,
  status: string,
) {
  const now = new Date().toISOString()
  for (let no = 1; no <= count; no += 1) {
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

async function createTestDb() {
  const db = await createDatabase(':memory:')
  await initializeDatabase(db)
  return db
}

describe('startBatchPlanning', () => {
  it('enqueues a planning task and creates a batch for the selected chapter range', async () => {
    const db = await createTestDb()
    await seedProject(db)
    await seedChapters(db, 5, 'event_extracted')
    const deps = makeDeps(db)

    const result = await startBatchPlanning(deps, 'p1', { chapterEndNo: 3, options: undefined })

    expect(result.status).toBe('pending')
    expect(deps.scheduler.count).toBe(1)

    const [batch] = await db.select().from(batches).where(eq(batches.id, result.batchId))
    expect(batch.batchNo).toBe(1)
    expect([batch.chapterStartNo, batch.chapterEndNo]).toEqual([1, 3])
    expect(batch.episodeStartNo).toBe(1)

    const [task] = await db.select().from(generationTasks).where(eq(generationTasks.id, result.taskId))
    expect(task.taskType).toBe('episode_planning')
    const input = JSON.parse(task.inputJson)
    expect(input.batchId).toBe(result.batchId)
    expect(input.mode).toBe('create')
    expect(input.episodeStartNo).toBe(1)
    expect(input.chapterIds).toEqual(['c1', 'c2', 'c3'])
  })

  it('locks the next batch start to the previous batch end + 1', async () => {
    const db = await createTestDb()
    await seedProject(db)
    await seedChapters(db, 5, 'event_extracted')
    const now = new Date().toISOString()
    // Batch 1 already covers chapters 1-2, episodes 1-4.
    await db.insert(batches).values({
      id: 'b1',
      projectId: 'p1',
      batchNo: 1,
      chapterStartNo: 1,
      chapterEndNo: 2,
      episodeStartNo: 1,
      episodeEndNo: 4,
      status: 'planned',
      createdAt: now,
      updatedAt: now,
    })
    const deps = makeDeps(db)

    const result = await startBatchPlanning(deps, 'p1', { chapterEndNo: 5, options: undefined })
    const [batch] = await db.select().from(batches).where(eq(batches.id, result.batchId))
    expect(batch.batchNo).toBe(2)
    expect([batch.chapterStartNo, batch.chapterEndNo]).toEqual([3, 5])
    // Episodes continue after batch 1.
    expect(batch.episodeStartNo).toBe(5)

    const [task] = await db.select().from(generationTasks).where(eq(generationTasks.id, result.taskId))
    expect(JSON.parse(task.inputJson).episodeStartNo).toBe(5)
  })

  it('rejects with 422 when a chapter in the selected range is not extracted', async () => {
    const db = await createTestDb()
    await seedProject(db)
    await seedChapters(db, 3, 'event_extracted')
    // Chapter 2 regressed / never finished extraction.
    await db.update(novelChapters).set({ status: 'pending' }).where(eq(novelChapters.id, 'c2'))
    const deps = makeDeps(db)

    await expect(startBatchPlanning(deps, 'p1', { chapterEndNo: 3, options: undefined })).rejects.toMatchObject({
      statusCode: 422,
      data: { chapterNos: [2] },
    })
    expect(deps.scheduler.count).toBe(0)
    // No batch row should linger for a rejected plan.
    expect(await db.select().from(batches).where(eq(batches.projectId, 'p1'))).toHaveLength(0)
  })

  it('does NOT block on un-extracted chapters OUTSIDE the selected range', async () => {
    const db = await createTestDb()
    await seedProject(db)
    await seedChapters(db, 5, 'event_extracted')
    // Chapters 4-5 are a future batch, not yet extracted.
    await db.update(novelChapters).set({ status: 'pending' }).where(eq(novelChapters.id, 'c4'))
    await db.update(novelChapters).set({ status: 'pending' }).where(eq(novelChapters.id, 'c5'))
    const deps = makeDeps(db)

    // Planning chapters 1-3 (all extracted) must succeed even though 4-5 aren't.
    const result = await startBatchPlanning(deps, 'p1', { chapterEndNo: 3, options: undefined })
    expect(result.status).toBe('pending')
  })

  it('rejects with 422 when chapterEndNo exceeds available chapters', async () => {
    const db = await createTestDb()
    await seedProject(db)
    await seedChapters(db, 3, 'event_extracted')
    const deps = makeDeps(db)

    await expect(startBatchPlanning(deps, 'p1', { chapterEndNo: 10, options: undefined })).rejects.toBeInstanceOf(
      EpisodePlannerServiceError,
    )
  })
})
