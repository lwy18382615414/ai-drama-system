import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import {
  closeDatabase,
  createDatabase,
  generationTasks,
  initializeDatabase,
  projects,
  type DatabaseClient,
} from '../../database/index.js'
import { TaskWorker } from '../index.js'

const workers: TaskWorker[] = []
const dbs: DatabaseClient[] = []

afterEach(() => {
  for (const worker of workers.splice(0)) worker.stop()
  for (const db of dbs.splice(0)) closeDatabase(db)
})

async function setup() {
  const db = await createDatabase(':memory:')
  await initializeDatabase(db)
  dbs.push(db)
  const now = new Date().toISOString()
  await db.insert(projects).values({ id: 'p1', title: 'T', createdAt: now, updatedAt: now })
  return db
}

function track(worker: TaskWorker): TaskWorker {
  workers.push(worker)
  return worker
}

async function insertTask(
  db: DatabaseClient,
  overrides: Partial<typeof generationTasks.$inferInsert> = {},
): Promise<string> {
  const now = new Date().toISOString()
  const id = overrides.id ?? `task-${Math.random().toString(36).slice(2)}`
  await db.insert(generationTasks).values({
    id,
    projectId: 'p1',
    taskType: 'unit_test',
    inputJson: JSON.stringify({ id }),
    status: 'pending',
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  })
  return id
}

async function getTask(db: DatabaseClient, id: string) {
  const [task] = await db.select().from(generationTasks).where(eq(generationTasks.id, id)).limit(1)
  return task
}

async function waitFor(predicate: () => Promise<boolean>) {
  for (let i = 0; i < 100; i += 1) {
    if (await predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error('Condition not met in time')
}

describe('TaskWorker', () => {
  it('claims a pending task exactly once even under concurrent drains', async () => {
    const db = await setup()
    const runs: string[] = []
    const worker = track(new TaskWorker(db, { pollIntervalMs: 3_600_000 }))
    worker.register('unit_test', async (task) => {
      runs.push(task.id)
      await db
        .update(generationTasks)
        .set({ status: 'completed', updatedAt: new Date().toISOString() })
        .where(eq(generationTasks.id, task.id))
    })

    const id = await insertTask(db)
    worker.start()
    // Fire several overlapping notifies to try to double-claim the same row.
    worker.notify()
    worker.notify()
    worker.notify()

    await waitFor(async () => (await getTask(db, id)).status === 'completed')
    expect(runs).toEqual([id])
  })

  it('recovers a task left running by a previous process', async () => {
    const db = await setup()
    // Simulate a crash: a task stuck in `running` with no worker attending it.
    const id = await insertTask(db, { status: 'running', startedAt: new Date().toISOString() })

    const worker = track(new TaskWorker(db, { pollIntervalMs: 3_600_000 }))
    worker.register('unit_test', async (task) => {
      await db
        .update(generationTasks)
        .set({ status: 'completed', updatedAt: new Date().toISOString() })
        .where(eq(generationTasks.id, task.id))
    })

    // No notify(): recovery on start() alone must pick the straggler back up.
    worker.start()

    await waitFor(async () => (await getTask(db, id)).status === 'completed')
  })

  it('retries a failing task up to maxRetries then leaves it failed', async () => {
    const db = await setup()
    let attempts = 0
    const worker = track(new TaskWorker(db, { pollIntervalMs: 3_600_000, maxRetries: 2 }))
    worker.register('unit_test', async (task) => {
      attempts += 1
      // Runners own their own final status; emulate a runner that always fails.
      await db
        .update(generationTasks)
        .set({ status: 'failed', errorMessage: 'boom', updatedAt: new Date().toISOString() })
        .where(eq(generationTasks.id, task.id))
    })

    const id = await insertTask(db)
    worker.start()
    worker.notify()

    await waitFor(async () => {
      const task = await getTask(db, id)
      return task.status === 'failed' && task.retryCount === 2
    })
    // 1 initial attempt + 2 retries.
    expect(attempts).toBe(3)
  })

  it('eventually succeeds when a task fails once then passes', async () => {
    const db = await setup()
    let attempts = 0
    const worker = track(new TaskWorker(db, { pollIntervalMs: 3_600_000, maxRetries: 2 }))
    worker.register('unit_test', async (task) => {
      attempts += 1
      const status = attempts === 1 ? 'failed' : 'completed'
      await db
        .update(generationTasks)
        .set({ status, errorMessage: status === 'failed' ? 'transient' : null, updatedAt: new Date().toISOString() })
        .where(eq(generationTasks.id, task.id))
    })

    const id = await insertTask(db)
    worker.start()
    worker.notify()

    await waitFor(async () => (await getTask(db, id)).status === 'completed')
    expect(attempts).toBe(2)
  })

  it('marks a task failed when no handler is registered for its type', async () => {
    const db = await setup()
    const worker = track(new TaskWorker(db, { pollIntervalMs: 3_600_000 }))
    const id = await insertTask(db, { taskType: 'unregistered' })
    worker.start()
    worker.notify()

    await waitFor(async () => (await getTask(db, id)).status === 'failed')
    const task = await getTask(db, id)
    expect(task.errorMessage).toContain('unregistered')
  })
})
