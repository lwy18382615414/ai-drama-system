import { and, eq, inArray } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { DatabaseClient } from '../../../packages/database/index.js'
import { generationJobs, generationTasks } from '../../../packages/database/index.js'
import type { TaskScheduler } from '../../../packages/tasks/index.js'

export async function createGenerationJob(
  db: DatabaseClient,
  input: { projectId: string; episodeId?: string | null; jobType: string; totalCount: number; skippedCount?: number },
) {
  const now = new Date().toISOString()
  const id = nanoid()
  await db.insert(generationJobs).values({
    id,
    projectId: input.projectId,
    episodeId: input.episodeId ?? null,
    jobType: input.jobType,
    status: input.totalCount > 0 ? 'pending' : 'completed',
    totalCount: input.totalCount,
    pendingCount: input.totalCount,
    skippedCount: input.skippedCount ?? 0,
    progressPercent: input.totalCount === 0 ? 100 : 0,
    createdAt: now,
    updatedAt: now,
  })
  return id
}

/** Rebuild persisted aggregate counts from task rows; safe after every Worker state transition. */
export async function refreshGenerationJob(db: DatabaseClient, jobId: string) {
  const [job] = await db.select().from(generationJobs).where(eq(generationJobs.id, jobId)).limit(1)
  if (!job) return null
  const tasks = await db.select().from(generationTasks).where(eq(generationTasks.jobId, jobId))
  const count = (statuses: string[]) => tasks.filter((task) => statuses.includes(task.status)).length
  const pendingCount = count(['pending', 'retry_wait'])
  const runningCount = count(['running'])
  const succeededCount = count(['completed'])
  const failedCount = count(['failed'])
  const cancelledCount = count(['cancelled'])
  const done = succeededCount + failedCount + cancelledCount
  const totalCount = Math.max(job.totalCount, tasks.length)
  const status = job.cancelRequestedAt
    ? (runningCount > 0 ? 'cancelling' : 'cancelled')
    : failedCount > 0 && pendingCount + runningCount === 0
      ? 'failed'
      : pendingCount + runningCount > 0
        ? (runningCount > 0 ? 'running' : 'pending')
        : 'completed'
  const now = new Date().toISOString()
  await db.update(generationJobs).set({
    status,
    totalCount,
    pendingCount,
    runningCount,
    succeededCount,
    failedCount,
    skippedCount: job.skippedCount,
    progressPercent: totalCount === 0 ? 100 : Math.round((done / totalCount) * 100),
    updatedAt: now,
  }).where(eq(generationJobs.id, jobId))
  const [updated] = await db.select().from(generationJobs).where(eq(generationJobs.id, jobId)).limit(1)
  return updated ?? null
}

export async function getGenerationJob(db: DatabaseClient, jobId: string) {
  const [job] = await db.select().from(generationJobs).where(eq(generationJobs.id, jobId)).limit(1)
  return job ?? null
}

export async function cancelGenerationJob(db: DatabaseClient, scheduler: TaskScheduler, jobId: string) {
  const [job] = await db.select().from(generationJobs).where(eq(generationJobs.id, jobId)).limit(1)
  if (!job) return null
  const now = new Date().toISOString()
  await db.update(generationJobs).set({ cancelRequestedAt: now, updatedAt: now }).where(eq(generationJobs.id, jobId))
  const queued = await db.select({ id: generationTasks.id }).from(generationTasks)
    .where(eq(generationTasks.jobId, jobId))
  const ids = queued.map((row) => row.id)
  if (ids.length > 0) {
    await db.update(generationTasks).set({ status: 'cancelled', cancelRequestedAt: now, completedAt: now, nextRetryAt: null, updatedAt: now })
      .where(and(inArray(generationTasks.id, ids), inArray(generationTasks.status, ['pending', 'retry_wait'])))
    await db.update(generationTasks).set({ cancelRequestedAt: now, updatedAt: now })
      .where(and(inArray(generationTasks.id, ids), eq(generationTasks.status, 'running')))
    await scheduler.announce(ids)
  }
  return refreshGenerationJob(db, jobId)
}
