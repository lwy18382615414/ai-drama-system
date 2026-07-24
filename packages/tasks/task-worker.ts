import { and, asc, eq, inArray, isNull, lte, or } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import type { DatabaseClient, GenerationTask } from '../database/index.js'
import { generationJobs, generationTasks } from '../database/index.js'
import { enrichTaskEvent, type TaskEvent, type TaskEventBus } from './task-event.js'

/** Reconstructs a task's execution from its persisted row (input lives in `inputJson`) and runs it. */
export type TaskHandler = (task: GenerationTask) => Promise<void>

/**
 * Minimal surface the service layer depends on: enqueue a row, then poke the worker to run it.
 * {@link announce} pushes a freshly-created task (or batch of tasks) to live SSE listeners so
 * pending-but-not-yet-claimed tasks appear immediately, rather than only once the worker claims
 * them (which, under the concurrency cap, may leave queued tasks invisible until a slot frees).
 */
export interface TaskScheduler {
  /** Pushes newly-created tasks to live listeners. Idempotent and safe to call with no subscribers. */
  announce(taskIds: string | string[]): Promise<void>
  notify(): void
}

export interface TaskWorkerOptions {
  /** Max tasks executing concurrently in this process. */
  concurrency?: number
  /** How many times a failed task is retried before staying `failed`. */
  maxRetries?: number
  /** Safety poll interval (ms) that backstops missed `notify()` calls and recovers stragglers. */
  pollIntervalMs?: number
  /** Lease duration for a claimed task. A stale lease is recoverable without process restart. */
  leaseDurationMs?: number
  /** Stable identity recorded on task leases; override in tests or a separately deployed worker. */
  workerId?: string
  /** Initial retry delay; subsequent failures back off exponentially with a small jitter. */
  retryBaseDelayMs?: number
}

/**
 * In-process, database-backed task worker. Tasks are dispatched purely from `generation_tasks`
 * rows, so pending/interrupted work survives a restart. Designed to be swapped for BullMQ later
 * behind the same {@link TaskScheduler} surface.
 */
export class TaskWorker implements TaskScheduler, TaskEventBus {
  private readonly handlers = new Map<string, TaskHandler>()
  private readonly inFlight = new Set<string>()
  /** Live task-event listeners, keyed by projectId, for SSE fan-out. */
  private readonly listeners = new Map<string, Set<(event: TaskEvent) => void>>()
  private readonly concurrency: number
  private readonly maxRetries: number
  private readonly pollIntervalMs: number
  private readonly leaseDurationMs: number
  private readonly workerId: string
  private readonly retryBaseDelayMs: number

  private started = false
  private draining = false
  private pollTimer: ReturnType<typeof setInterval> | undefined
  /** Optional post-settle hook, used by the pipeline orchestrator to advance a run's next step. */
  private settledHook: ((task: GenerationTask) => void | Promise<void>) | undefined

  constructor(
    private readonly db: DatabaseClient,
    options: TaskWorkerOptions = {},
  ) {
    this.concurrency = options.concurrency ?? 2
    this.maxRetries = options.maxRetries ?? 2
    this.pollIntervalMs = options.pollIntervalMs ?? 30_000
    this.leaseDurationMs = options.leaseDurationMs ?? 60_000
    this.workerId = options.workerId ?? `worker-${randomUUID()}`
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 250
  }

  register(taskType: string, handler: TaskHandler): void {
    this.handlers.set(taskType, handler)
  }

  /**
   * Registers a hook invoked after every task settles (completed/failed/cancelled/requeued),
   * once its job aggregate has been refreshed. Used to chain multi-step orchestrated runs.
   * Hook failures are isolated and never affect task execution.
   */
  onSettled(hook: (task: GenerationTask) => void | Promise<void>): void {
    this.settledHook = hook
  }

  /** Begins recovery + polling and claims any already-pending work. Idempotent. */
  start(): void {
    if (this.started) return
    this.started = true
    this.pollTimer = setInterval(() => {
      void this.recover().finally(() => this.drain())
    }, this.pollIntervalMs)
    // Don't let the safety poll keep the process (or a test runner) alive on its own.
    this.pollTimer.unref?.()
    void this.bootstrap()
  }

  /** Stops claiming new tasks. In-flight tasks are allowed to finish. */
  stop(): void {
    this.started = false
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = undefined
    }
  }

  /** Triggers an immediate drain pass (near-zero latency, replaces the old `setTimeout` dispatch). */
  notify(): void {
    void this.drain()
  }

  /** {@link TaskScheduler} — pushes freshly-created tasks to live listeners so pending tasks show up. */
  async announce(taskIds: string | string[]): Promise<void> {
    const ids = Array.isArray(taskIds) ? taskIds : [taskIds]
    if (ids.length === 0 || this.listeners.size === 0) return
    const rows = await this.db
      .select()
      .from(generationTasks)
      .where(inArray(generationTasks.id, ids))
    await Promise.all(rows.map((row) => this.emitEvent(row)))
  }

  /** {@link TaskEventBus} — registers a per-project listener; returns an unsubscribe function. */
  subscribe(projectId: string, listener: (event: TaskEvent) => void): () => void {
    let set = this.listeners.get(projectId)
    if (!set) {
      set = new Set()
      this.listeners.set(projectId, set)
    }
    set.add(listener)

    return () => {
      const current = this.listeners.get(projectId)
      if (!current) return
      current.delete(listener)
      if (current.size === 0) this.listeners.delete(projectId)
    }
  }

  /**
   * Enriches a task row (resolving its target name against the DB) and fans it out to the
   * project's listeners. One bad listener can't wedge the worker.
   */
  private async emitEvent(task: GenerationTask): Promise<void> {
    const set = this.listeners.get(task.projectId)
    if (!set || set.size === 0) return
    const event = await enrichTaskEvent(this.db, task)
    for (const listener of set) {
      try {
        listener(event)
      } catch {
        // Listener failures are isolated; task execution must not be affected.
      }
    }
  }

  /** Re-reads a task and emits its current status. Used after a run settles (completed/failed/requeued). */
  private async emitCurrent(taskId: string): Promise<void> {
    if (this.listeners.size === 0) return
    const [task] = await this.db.select().from(generationTasks).where(eq(generationTasks.id, taskId)).limit(1)
    if (task) await this.emitEvent(task)
  }

  /**
   * Requeues only abandoned work. A healthy task owns a renewable lease, so a second worker or
   * process restart cannot blindly replay all `running` rows and duplicate an in-flight provider call.
   */
  async recover(): Promise<void> {
    const now = new Date().toISOString()
    await this.db
      .update(generationTasks)
      .set({
        status: 'pending',
        lockedBy: null,
        lockedAt: null,
        heartbeatAt: null,
        leaseExpiresAt: null,
        updatedAt: now,
      })
      .where(and(
        eq(generationTasks.status, 'running'),
        or(isNull(generationTasks.leaseExpiresAt), lte(generationTasks.leaseExpiresAt, now)),
      ))

    // A retry becomes claimable only after its persisted backoff time. The promotion makes the
    // state visible to old SSE clients while preserving a durable retry schedule.
    await this.db
      .update(generationTasks)
      .set({ status: 'pending', nextRetryAt: null, updatedAt: now })
      .where(and(eq(generationTasks.status, 'retry_wait'), lte(generationTasks.nextRetryAt, now)))
  }

  private async bootstrap(): Promise<void> {
    try {
      await this.recover()
    } catch {
      // Recovery is best-effort; the safety poll will retry stragglers.
    }
    await this.drain()
  }

  private async drain(): Promise<void> {
    if (!this.started || this.draining) return
    this.draining = true
    try {
      while (this.started && this.inFlight.size < this.concurrency) {
        const task = await this.claimNext()
        if (!task) break
        this.inFlight.add(task.id)
        void this.runClaimed(task).finally(() => {
          this.inFlight.delete(task.id)
          // A slot just freed — try to pull more work.
          void this.drain()
        })
      }
    } finally {
      this.draining = false
    }
  }

  /** Atomically claims the oldest ready task (pending -> running). Returns undefined if none. */
  private async claimNext(): Promise<GenerationTask | undefined> {
    const now = new Date().toISOString()
    const [task] = await this.db
      .select()
      .from(generationTasks)
      .where(and(
        eq(generationTasks.status, 'pending'),
        or(isNull(generationTasks.nextRetryAt), lte(generationTasks.nextRetryAt, now)),
      ))
      .orderBy(asc(generationTasks.createdAt))
      .limit(1)

    if (!task) return undefined

    const leaseExpiresAt = new Date(Date.now() + this.leaseDurationMs).toISOString()
    const result = await this.db
      .update(generationTasks)
      .set({
        status: 'running',
        startedAt: task.startedAt ?? now,
        lockedBy: this.workerId,
        lockedAt: now,
        heartbeatAt: now,
        leaseExpiresAt,
        nextRetryAt: null,
        updatedAt: now,
        errorMessage: null,
        errorCode: null,
        errorDetailsJson: null,
      })
      .where(and(eq(generationTasks.id, task.id), eq(generationTasks.status, 'pending')))

    if ((result.rowsAffected ?? 0) < 1) {
      // Another worker/pass won the race; the row is no longer pending, so try the next one.
      return this.claimNext()
    }

    const claimed = {
      ...task,
      status: 'running',
      startedAt: task.startedAt ?? now,
      lockedBy: this.workerId,
      lockedAt: now,
      heartbeatAt: now,
      leaseExpiresAt,
      nextRetryAt: null,
      updatedAt: now,
      errorMessage: null,
      errorCode: null,
      errorDetailsJson: null,
    }
    void this.emitEvent(claimed)
    return claimed
  }

  private async runClaimed(task: GenerationTask): Promise<void> {
    const heartbeat = setInterval(() => void this.renewLease(task.id), Math.max(1_000, this.leaseDurationMs / 2))
    heartbeat.unref?.()
    try {
      if (task.cancelRequestedAt) {
        await this.markCancelled(task.id)
        return
      }
      const handler = this.handlers.get(task.taskType)
      if (!handler) {
        await this.markFailed(task.id, `No handler registered for task type: ${task.taskType}`)
        return
      }

      try {
        // Handlers delegate to runners that own their own final status (completed/failed).
        await handler(task)
      } catch (error) {
        // Runners don't normally throw, but guard so one bad task can't wedge the loop.
        await this.markFailed(task.id, error)
      }

      await this.settleCancelledTask(task.id)
      await this.maybeRetry(task.id)
    } finally {
      clearInterval(heartbeat)
      await this.releaseLease(task.id)
      await this.refreshJob(task.jobId)
      // Emit the settled state (completed / failed / requeued-to-pending) to any subscribers.
      await this.emitCurrent(task.id)
      // Notify the orchestrator last, after counts are refreshed, so it observes settled state.
      if (this.settledHook) {
        try {
          await this.settledHook(task)
        } catch {
          // Orchestration hook failures must never wedge the worker loop.
        }
      }
    }
  }

  /** If the handler left the task `failed` and retries remain, persist an exponential-backoff retry. */
  private async maybeRetry(taskId: string): Promise<void> {
    const [task] = await this.db.select().from(generationTasks).where(eq(generationTasks.id, taskId)).limit(1)
    if (!task || task.status !== 'failed') return
    if (task.retryCount >= this.maxRetries) return

    const now = new Date()
    const delayMs = Math.min(60_000, this.retryBaseDelayMs * 2 ** task.retryCount) + Math.floor(Math.random() * 50)
    await this.db
      .update(generationTasks)
      .set({
        status: 'retry_wait',
        retryCount: task.retryCount + 1,
        errorMessage: null,
        errorCode: null,
        errorDetailsJson: null,
        startedAt: null,
        completedAt: null,
        nextRetryAt: new Date(now.getTime() + delayMs).toISOString(),
        updatedAt: now.toISOString(),
      })
      .where(eq(generationTasks.id, taskId))

    // The periodic recovery poll is crash-safe; this timer is only a latency optimization for a
    // live worker and promotes the persisted retry before waking the drain loop.
    const retryTimer = setTimeout(() => {
      void this.promoteDueRetries().finally(() => this.notify())
    }, delayMs)
    retryTimer.unref?.()
  }

  private async markFailed(taskId: string, error: unknown): Promise<void> {
    const now = new Date().toISOString()
    const message = error instanceof Error ? error.message : String(error)
    await this.db
      .update(generationTasks)
      .set({
        status: 'failed',
        errorMessage: message,
        errorCode: 'internal_error',
        errorDetailsJson: JSON.stringify({ message }),
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(generationTasks.id, taskId))

  }

  private async renewLease(taskId: string): Promise<void> {
    const now = new Date()
    await this.db
      .update(generationTasks)
      .set({ heartbeatAt: now.toISOString(), leaseExpiresAt: new Date(now.getTime() + this.leaseDurationMs).toISOString(), updatedAt: now.toISOString() })
      .where(and(eq(generationTasks.id, taskId), eq(generationTasks.status, 'running'), eq(generationTasks.lockedBy, this.workerId)))
  }

  private async promoteDueRetries(): Promise<void> {
    const now = new Date().toISOString()
    await this.db
      .update(generationTasks)
      .set({ status: 'pending', nextRetryAt: null, updatedAt: now })
      .where(and(eq(generationTasks.status, 'retry_wait'), lte(generationTasks.nextRetryAt, now)))
  }

  private async releaseLease(taskId: string): Promise<void> {
    const now = new Date().toISOString()
    await this.db
      .update(generationTasks)
      .set({ lockedBy: null, lockedAt: null, heartbeatAt: null, leaseExpiresAt: null, updatedAt: now })
      .where(and(eq(generationTasks.id, taskId), eq(generationTasks.lockedBy, this.workerId)))
  }

  private async settleCancelledTask(taskId: string): Promise<void> {
    const [task] = await this.db.select().from(generationTasks).where(eq(generationTasks.id, taskId)).limit(1)
    // Runners own their success/failure writes and therefore commonly change `running` to
    // `completed` before returning. A cancellation requested while the provider was in flight
    // must still win over that handler-written terminal state and must not be retried.
    if (task?.cancelRequestedAt && task.status !== 'cancelled') await this.markCancelled(taskId)
  }

  private async markCancelled(taskId: string): Promise<void> {
    const now = new Date().toISOString()
    await this.db
      .update(generationTasks)
      .set({ status: 'cancelled', completedAt: now, nextRetryAt: null, updatedAt: now })
      .where(eq(generationTasks.id, taskId))
  }

  private async refreshJob(jobId: string | null): Promise<void> {
    if (!jobId) return
    const [job] = await this.db.select().from(generationJobs).where(eq(generationJobs.id, jobId)).limit(1)
    if (!job) return
    const tasks = await this.db.select().from(generationTasks).where(eq(generationTasks.jobId, jobId))
    const count = (statuses: string[]) => tasks.filter((task) => statuses.includes(task.status)).length
    const pendingCount = count(['pending', 'retry_wait'])
    const runningCount = count(['running'])
    const succeededCount = count(['completed'])
    const failedCount = count(['failed'])
    const cancelledCount = count(['cancelled'])
    const totalCount = Math.max(job.totalCount, tasks.length)
    const done = succeededCount + failedCount + cancelledCount
    const status = job.cancelRequestedAt
      ? (runningCount > 0 ? 'cancelling' : 'cancelled')
      : failedCount > 0 && pendingCount + runningCount === 0
        ? 'failed'
        : pendingCount + runningCount > 0
          ? (runningCount > 0 ? 'running' : 'pending')
          : 'completed'
    const now = new Date().toISOString()
    await this.db.update(generationJobs).set({
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
  }
}
