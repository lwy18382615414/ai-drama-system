import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { z } from 'zod/v4'
import type { DatabaseClient } from '../../../packages/database/index.js'
import { generationTasks, novelEvents } from '../../../packages/database/index.js'
import { EventAgentOptionsSchema } from '../../../packages/agents/event-agent/index.js'
import type { StructuredTextProvider } from '../../../packages/providers/index.js'
import type { TaskScheduler } from '../../../packages/tasks/index.js'

export const StartEventExtractionRequestSchema = z.object({
  projectId: z.string().min(1),
  chapterId: z.string().min(1),
  options: EventAgentOptionsSchema.optional(),
})

export type StartEventExtractionRequest = z.infer<typeof StartEventExtractionRequestSchema>

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
