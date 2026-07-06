import { describe, expect, it } from 'vitest'
import {
  createDatabase,
  generationTasks,
  initializeDatabase,
  projects,
  type DatabaseClient,
} from '../../../packages/database/index.js'
import { listRecoverableTasks, RECOVERABLE_TERMINAL_WINDOW_MS } from './task-stream-service.js'

async function setup(): Promise<DatabaseClient> {
  const db = await createDatabase(':memory:')
  await initializeDatabase(db)
  const now = new Date().toISOString()
  await db.insert(projects).values({ id: 'p1', title: 'T', createdAt: now, updatedAt: now })
  await db.insert(projects).values({ id: 'p2', title: 'Other', createdAt: now, updatedAt: now })
  return db
}

async function insertTask(
  db: DatabaseClient,
  overrides: Partial<typeof generationTasks.$inferInsert>,
): Promise<void> {
  const now = new Date().toISOString()
  await db.insert(generationTasks).values({
    id: overrides.id ?? `task-${Math.random().toString(36).slice(2)}`,
    projectId: 'p1',
    taskType: 'event_extraction',
    inputJson: '{}',
    status: 'pending',
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  })
}

describe('listRecoverableTasks', () => {
  it('includes all active tasks plus recently settled ones, ordered by creation', async () => {
    const db = await setup()
    const recentTerminal = new Date(Date.now() - 60_000).toISOString()
    const oldTerminal = new Date(Date.now() - RECOVERABLE_TERMINAL_WINDOW_MS - 60_000).toISOString()

    await insertTask(db, { id: 'pending-1', status: 'pending', createdAt: '2020-01-01T00:00:01Z' })
    await insertTask(db, { id: 'running-1', status: 'running', createdAt: '2020-01-01T00:00:02Z' })
    await insertTask(db, {
      id: 'recent-done',
      status: 'completed',
      updatedAt: recentTerminal,
      createdAt: '2020-01-01T00:00:03Z',
    })
    await insertTask(db, {
      id: 'recent-failed',
      status: 'failed',
      errorMessage: 'boom',
      updatedAt: recentTerminal,
      createdAt: '2020-01-01T00:00:04Z',
    })
    // Excluded: terminal but too old.
    await insertTask(db, { id: 'old-done', status: 'completed', updatedAt: oldTerminal })
    // Excluded: belongs to another project.
    await insertTask(db, { id: 'other-project', projectId: 'p2', status: 'running' })

    const result = await listRecoverableTasks(db, 'p1')

    expect(result.map((t) => t.taskId)).toEqual([
      'pending-1',
      'running-1',
      'recent-done',
      'recent-failed',
    ])
    expect(result.find((t) => t.taskId === 'recent-failed')?.errorMessage).toBe('boom')
  })

  it('returns an empty list for a project with no recoverable tasks', async () => {
    const db = await setup()
    expect(await listRecoverableTasks(db, 'p1')).toEqual([])
  })
})
