import type { DatabaseClient } from '../../../packages/database/index.js'
import {
  MockImageProvider,
  MockStructuredTextProvider,
  type ImageProvider,
  type StructuredTextProvider,
} from '../../../packages/providers/index.js'
import type { TaskWorker } from '../../../packages/tasks/index.js'
import { createTaskWorker } from '../tasks.js'

export interface TestWorkerOptions {
  provider?: StructuredTextProvider
  imageProvider?: ImageProvider
  /** Defaults to 0 so forced-failure unit tests settle deterministically without background retries. */
  maxRetries?: number
}

/**
 * Builds and starts a task worker for tests. Execution is driven by `notify()` (as in
 * production), so the periodic safety poll is pushed far out to keep abandoned test workers
 * from polling a closed database. Missing providers default to mocks — handlers a test never
 * triggers are simply never invoked. Retries default off; the retry path is covered by
 * task-worker.test.ts, which drives a TaskWorker directly.
 */
export function startTestWorker(db: DatabaseClient, options: TestWorkerOptions = {}): TaskWorker {
  const worker = createTaskWorker(
    {
      db,
      provider: options.provider ?? new MockStructuredTextProvider(),
      imageProvider: options.imageProvider ?? new MockImageProvider(),
    },
    { pollIntervalMs: 3_600_000, maxRetries: options.maxRetries ?? 0 },
  )
  worker.start()
  return worker
}
