import { and, eq, inArray } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { z } from 'zod/v4'
import type { DatabaseClient } from '../../../packages/database/index.js'
import { generationTasks, novelChapters, novelEvents } from '../../../packages/database/index.js'
import { EventAgentOptionsSchema } from '../../../packages/agents/event-agent/index.js'
import type { StructuredTextProvider } from '../../../packages/providers/index.js'
import type { TaskScheduler } from '../../../packages/tasks/index.js'
import { activeExtractionChapterIds, plannedChapterEndNo } from './chapter-guards.js'

export class EventAgentServiceError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message)
  }
}

export const StartEventExtractionRequestSchema = z.object({
  projectId: z.string().min(1),
  chapterId: z.string().min(1),
  options: EventAgentOptionsSchema.optional(),
})

export type StartEventExtractionRequest = z.infer<typeof StartEventExtractionRequestSchema>

export const StartBatchEventExtractionRequestSchema = z.object({
  projectId: z.string().min(1),
  chapterIds: z.array(z.string().min(1)).min(1).max(1000),
  options: EventAgentOptionsSchema.optional(),
})

export type StartBatchEventExtractionRequest = z.infer<typeof StartBatchEventExtractionRequestSchema>

export interface BatchExtractionSkip {
  chapterId: string
  reason: 'planned' | 'extracting'
}

export interface EventAgentServiceDeps {
  db: DatabaseClient
  provider: StructuredTextProvider
  scheduler: TaskScheduler
}

export async function startEventExtraction(
  deps: EventAgentServiceDeps,
  request: StartEventExtractionRequest,
) {
  const input = StartEventExtractionRequestSchema.parse(request)
  const now = new Date().toISOString()
  const taskId = nanoid()

  await deps.db.insert(generationTasks).values({
    id: taskId,
    projectId: input.projectId,
    episodeId: null,
    storyboardId: null,
    taskType: 'event_extraction',
    provider: deps.provider.name,
    model: input.options?.model ?? deps.provider.model,
    inputJson: JSON.stringify({ ...input, taskId }),
    outputJson: null,
    status: 'pending',
    retryCount: 0,
    errorMessage: null,
    startedAt: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  })

  deps.scheduler.notify()

  return { taskId, status: 'pending' as const }
}

/**
 * Server-side fan-out: enqueues one independent event_extraction task per eligible chapter,
 * so SSE updates, chapter ✓ marks, and per-chapter retry all keep their existing semantics.
 *
 * Unknown chapter ids fail the whole request (400 — the client's chapter list is stale).
 * Planned chapters (their events are FK-referenced by episode_event_links) and chapters
 * already extracting are skipped and reported back instead of enqueued.
 */
export async function startBatchEventExtraction(
  deps: EventAgentServiceDeps,
  request: StartBatchEventExtractionRequest,
) {
  const input = StartBatchEventExtractionRequestSchema.parse(request)
  const chapterIds = [...new Set(input.chapterIds)]

  const rows = await deps.db
    .select({ id: novelChapters.id, chapterNo: novelChapters.chapterNo, status: novelChapters.status })
    .from(novelChapters)
    .where(and(eq(novelChapters.projectId, input.projectId), inArray(novelChapters.id, chapterIds)))

  const byId = new Map(rows.map((row) => [row.id, row]))
  const missing = chapterIds.filter((id) => !byId.has(id))

  if (missing.length > 0) {
    throw new EventAgentServiceError(`Chapters not found in project: ${missing.join(', ')}`, 400)
  }

  const [plannedEndNo, extractingIds] = await Promise.all([
    plannedChapterEndNo(deps.db, input.projectId),
    activeExtractionChapterIds(deps.db, input.projectId),
  ])

  const skipped: BatchExtractionSkip[] = []
  const eligible: string[] = []

  for (const chapterId of chapterIds) {
    const chapter = byId.get(chapterId)!
    if (chapter.chapterNo <= plannedEndNo) {
      skipped.push({ chapterId, reason: 'planned' })
    } else if (chapter.status === 'event_extracting' || extractingIds.has(chapterId)) {
      skipped.push({ chapterId, reason: 'extracting' })
    } else {
      eligible.push(chapterId)
    }
  }

  const now = new Date().toISOString()
  const tasks = eligible.map((chapterId) => ({ taskId: nanoid(), chapterId }))

  if (tasks.length > 0) {
    await deps.db.transaction(async (tx) => {
      await tx.insert(generationTasks).values(
        tasks.map(({ taskId, chapterId }) => ({
          id: taskId,
          projectId: input.projectId,
          episodeId: null,
          storyboardId: null,
          taskType: 'event_extraction',
          provider: deps.provider.name,
          model: input.options?.model ?? deps.provider.model,
          inputJson: JSON.stringify({
            projectId: input.projectId,
            chapterId,
            options: input.options,
            taskId,
          }),
          outputJson: null,
          status: 'pending',
          retryCount: 0,
          errorMessage: null,
          startedAt: null,
          completedAt: null,
          createdAt: now,
          updatedAt: now,
        })),
      )
    })

    deps.scheduler.notify()
  }

  return { tasks, skipped }
}

export async function getEventExtractionStatus(db: DatabaseClient, taskId: string) {
  const [task] = await db
    .select()
    .from(generationTasks)
    .where(eq(generationTasks.id, taskId))
    .limit(1)

  return task ?? null
}

export async function getChapterEvents(db: DatabaseClient, chapterId: string) {
  return db
    .select()
    .from(novelEvents)
    .where(eq(novelEvents.chapterId, chapterId))
    .orderBy(novelEvents.eventNo)
}
