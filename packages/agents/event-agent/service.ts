import { nanoid } from 'nanoid'
import { eq } from 'drizzle-orm'
import type { DatabaseClient } from '../../database/index.js'
import { agentRuns, generationTasks, novelChapters, novelEvents } from '../../database/index.js'
import type { StructuredTextProvider } from '../../providers/index.js'
import { buildEventAgentContext } from './context.js'
import { buildEventAgentSystemPrompt, buildEventAgentUserPrompt } from './prompt.js'
import {
  EventAgentInputSchema,
  EventAgentOutputSchema,
  type EventAgentInput,
  type EventAgentResult,
} from './schema.js'

export interface RunEventAgentParams {
  db: DatabaseClient
  provider: StructuredTextProvider
  input: EventAgentInput
}

const AGENT_TYPE = 'EventAgent'
const SKILL_NAME = 'event-extraction'
const SKILL_VERSION = '1.0.0'
const TASK_TYPE = 'event_extraction'

export async function runEventAgent(params: RunEventAgentParams): Promise<EventAgentResult> {
  const input = EventAgentInputSchema.parse(params.input)
  const now = new Date().toISOString()
  const taskId = input.taskId ?? nanoid()
  const agentRunId = nanoid()
  let chapterValidated = false

  try {
    if (input.taskId) {
      await params.db
        .update(generationTasks)
        .set({
          status: 'running',
          provider: params.provider.name,
          model: input.options?.model ?? params.provider.model,
          startedAt: now,
          updatedAt: now,
          errorMessage: null,
        })
        .where(eq(generationTasks.id, input.taskId))
    } else {
      await params.db.insert(generationTasks).values({
        id: taskId,
        projectId: input.projectId,
        episodeId: null,
        storyboardId: null,
        taskType: TASK_TYPE,
        provider: params.provider.name,
        model: input.options?.model ?? params.provider.model,
        inputJson: JSON.stringify(input),
        outputJson: null,
        status: 'running',
        retryCount: 0,
        errorMessage: null,
        startedAt: now,
        completedAt: null,
        createdAt: now,
        updatedAt: now,
      })
    }

    await params.db.insert(agentRuns).values({
      id: agentRunId,
      projectId: input.projectId,
      episodeId: null,
      agentType: AGENT_TYPE,
      skillName: SKILL_NAME,
      skillVersion: SKILL_VERSION,
      model: input.options?.model ?? params.provider.model,
      inputJson: JSON.stringify(input),
      outputJson: null,
      status: 'running',
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
    })

    const context = await buildEventAgentContext(params.db, input)
    chapterValidated = true

    await params.db
      .update(novelChapters)
      .set({ status: 'event_extracting', updatedAt: new Date().toISOString() })
      .where(eq(novelChapters.id, input.chapterId))

    const providerResult = await params.provider.generateStructuredJson({
      systemPrompt: buildEventAgentSystemPrompt(),
      userPrompt: buildEventAgentUserPrompt(context, input),
      schemaName: 'EventAgentOutput',
      schema: EventAgentOutputSchema,
      metadata: {
        projectId: input.projectId,
        chapterId: input.chapterId,
        agentRunId,
        taskId,
      },
    })

    const output = EventAgentOutputSchema.parse(providerResult.data)
    const completedAt = new Date().toISOString()

    await params.db.transaction(async (tx) => {
      await tx.delete(novelEvents).where(eq(novelEvents.chapterId, input.chapterId))

      if (output.events.length > 0) {
        await tx.insert(novelEvents).values(
          output.events.map((event) => ({
            id: nanoid(),
            projectId: input.projectId,
            chapterId: input.chapterId,
            eventNo: event.eventNo,
            eventType: event.eventType,
            summary: event.summary,
            detail: event.detail,
            charactersJson: JSON.stringify(event.characters),
            location: event.location ?? null,
            timeHint: event.timeHint ?? null,
            emotionTone: event.emotionTone ?? null,
            conflictLevel: event.conflictLevel,
            importance: event.importance,
            sourceTextRangeJson: event.sourceTextRange ? JSON.stringify(event.sourceTextRange) : null,
            createdAt: completedAt,
            updatedAt: completedAt,
          })),
        )
      }

      await tx
        .update(novelChapters)
        .set({ status: 'event_extracted', updatedAt: completedAt })
        .where(eq(novelChapters.id, input.chapterId))

      await tx
        .update(agentRuns)
        .set({
          status: 'completed',
          model: providerResult.model,
          outputJson: JSON.stringify(output),
          errorMessage: null,
          updatedAt: completedAt,
        })
        .where(eq(agentRuns.id, agentRunId))

      await tx
        .update(generationTasks)
        .set({
          status: 'completed',
          provider: providerResult.provider,
          model: providerResult.model,
          outputJson: JSON.stringify(output),
          errorMessage: null,
          completedAt,
          updatedAt: completedAt,
        })
        .where(eq(generationTasks.id, taskId))
    })

    return {
      success: true,
      taskId,
      agentRunId,
      data: output,
    }
  } catch (error) {
    const failedAt = new Date().toISOString()
    const errorMessage = formatError(error)

    await markRunFailed(params.db, agentRunId, taskId, errorMessage, failedAt)

    if (chapterValidated) {
      await params.db
        .update(novelChapters)
        .set({ status: 'event_extract_failed', updatedAt: failedAt })
        .where(eq(novelChapters.id, input.chapterId))
    }

    return {
      success: false,
      taskId,
      agentRunId,
      error: errorMessage,
    }
  }
}

async function markRunFailed(
  db: DatabaseClient,
  agentRunId: string,
  taskId: string,
  errorMessage: string,
  failedAt: string,
) {
  try {
    await db
      .update(agentRuns)
      .set({ status: 'failed', errorMessage, updatedAt: failedAt })
      .where(eq(agentRuns.id, agentRunId))

    await db
      .update(generationTasks)
      .set({
        status: 'failed',
        errorMessage,
        completedAt: failedAt,
        updatedAt: failedAt,
      })
      .where(eq(generationTasks.id, taskId))
  } catch {
    // Failure reporting is best-effort; callers receive the original error below.
  }
}

function formatError(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}
