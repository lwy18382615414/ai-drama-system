import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
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
import type { TaskScheduler } from '../../../packages/tasks/index.js'
import { startBatchEventExtraction } from './event-agent-service.js'

/** Records announce()/notify() calls without running a worker, so pending tasks stay pending. */
function recordingScheduler(): TaskScheduler & {
  announced: string[][]
  notifications: number
} {
  const announced: string[][] = []
  let notifications = 0
  return {
    async announce(ids) {
      announced.push(Array.isArray(ids) ? ids : [ids])
    },
    notify() {
      notifications += 1
    },
    get announced() {
      return announced
    },
    get notifications() {
      return notifications
    },
  }
}

async function createTestDb(): Promise<DatabaseClient> {
  const db = await createDatabase(':memory:')
  await initializeDatabase(db)
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
  for (let no = 1; no <= 5; no += 1) {
    await db.insert(novelChapters).values({
      id: `c${no}`,
      projectId: 'p1',
      chapterNo: no,
      title: `第${no}章`,
      content: '正文',
      wordCount: 2,
      source: 'paste',
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    })
  }
  return db
}

describe('startBatchEventExtraction — pending task announcement', () => {
  it('announces every newly-created pending task so SSE listeners see queued tasks immediately', async () => {
    const db = await createTestDb()
    const scheduler = recordingScheduler()
    const provider = new MockStructuredTextProvider()

    const result = await startBatchEventExtraction(
      { db, provider, scheduler },
      { projectId: 'p1', chapterIds: ['c1', 'c2', 'c3', 'c4', 'c5'] },
    )

    // One announce call carrying all task ids (fan-out happens before the worker claims anything).
    expect(result.tasks).toHaveLength(5)
    expect(scheduler.announced).toHaveLength(1)
    expect(new Set(scheduler.announced[0])).toEqual(new Set(result.tasks.map((t) => t.taskId)))
    expect(scheduler.notifications).toBe(1)

    // Every announced task is still pending — the scheduler stub doesn't run the worker.
    for (const { taskId } of result.tasks) {
      const [row] = await db
        .select()
        .from(generationTasks)
        .where(eq(generationTasks.id, taskId))
        .limit(1)
      expect(row.status).toBe('pending')
    }
  })

  it('does not announce when all chapters are skipped', async () => {
    const db = await createTestDb()
    const now = new Date().toISOString()
    // Mark chapters 1-3 as already planned.
    await db.insert(batches).values({
      id: 'b1',
      projectId: 'p1',
      batchNo: 1,
      chapterStartNo: 1,
      chapterEndNo: 3,
      episodeStartNo: 1,
      episodeEndNo: 2,
      status: 'planned',
      createdAt: now,
      updatedAt: now,
    })
    const scheduler = recordingScheduler()
    const provider = new MockStructuredTextProvider()

    const result = await startBatchEventExtraction(
      { db, provider, scheduler },
      { projectId: 'p1', chapterIds: ['c1', 'c2', 'c3'] },
    )

    expect(result.tasks).toHaveLength(0)
    expect(scheduler.announced).toHaveLength(0)
    expect(scheduler.notifications).toBe(0)
  })
})
