import { and, asc, eq, inArray } from 'drizzle-orm'
import type { DatabaseClient, GenerationTask } from '../database/index.js'
import { generationTasks } from '../database/index.js'
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

  private started = false
  private draining = false
  private pollTimer: ReturnType<typeof setInterval> | undefined

  constructor(
    private readonly db: DatabaseClient,
    options: TaskWorkerOptions = {},
  ) {
    this.concurrency = options.concurrency ?? 2
    this.maxRetries = options.maxRetries ?? 2
    this.pollIntervalMs = options.pollIntervalMs ?? 30_000
  }

  register(taskType: string, handler: TaskHandler): void {
    this.handlers.set(taskType, handler)
  }

  /** Begins recovery + polling and claims any already-pending work. Idempotent. */
  start(): void {
    if (this.started) return
    this.started = true
    this.pollTimer = setInterval(() => void this.drain(), this.pollIntervalMs)
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
   * Requeues tasks a previous process left mid-flight (`running`) back to `pending` so they get
   * re-dispatched. Safe to call before any task is in flight in this process.
   */
  async recover(): Promise<void> {
    const now = new Date().toISOString()
    await this.db
      .update(generationTasks)
      .set({ status: 'pending', startedAt: null, updatedAt: now })
      .where(eq(generationTasks.status, 'running'))
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

  /** Atomically claims the oldest pending task (pending -> running). Returns undefined if none. */
  private async claimNext(): Promise<GenerationTask | undefined> {
    const [task] = await this.db
      .select()
      .from(generationTasks)
      .where(eq(generationTasks.status, 'pending'))
      .orderBy(asc(generationTasks.createdAt))
      .limit(1)

    if (!task) return undefined

    const now = new Date().toISOString()
    const result = await this.db
      .update(generationTasks)
      .set({ status: 'running', startedAt: now, updatedAt: now, errorMessage: null })
      .where(and(eq(generationTasks.id, task.id), eq(generationTasks.status, 'pending')))

    if ((result.rowsAffected ?? 0) < 1) {
      // Another worker/pass won the race; the row is no longer pending, so try the next one.
      return this.claimNext()
    }

    const claimed = { ...task, status: 'running', startedAt: now, updatedAt: now, errorMessage: null }
    void this.emitEvent(claimed)
    return claimed
  }

  private async runClaimed(task: GenerationTask): Promise<void> {
    try {
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

      await this.maybeRetry(task.id)
    } finally {
      // Emit the settled state (completed / failed / requeued-to-pending) to any subscribers.
      await this.emitCurrent(task.id)
    }
  }

  /** If the handler left the task `failed` and retries remain, requeue it as `pending`. */
  private async maybeRetry(taskId: string): Promise<void> {
    const [task] = await this.db.select().from(generationTasks).where(eq(generationTasks.id, taskId)).limit(1)
    if (!task || task.status !== 'failed') return
    if (task.retryCount >= this.maxRetries) return

    const now = new Date().toISOString()
    await this.db
      .update(generationTasks)
      .set({
        status: 'pending',
        retryCount: task.retryCount + 1,
        errorMessage: null,
        startedAt: null,
        completedAt: null,
        updatedAt: now,
      })
      .where(eq(generationTasks.id, taskId))
  }

  private async markFailed(taskId: string, error: unknown): Promise<void> {
    const now = new Date().toISOString()
    const message = error instanceof Error ? error.message : String(error)
    await this.db
      .update(generationTasks)
      .set({ status: 'failed', errorMessage: message, completedAt: now, updatedAt: now })
      .where(eq(generationTasks.id, taskId))
  }
}
