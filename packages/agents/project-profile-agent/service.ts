import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { DatabaseClient } from '../../database/index.js'
import { agentRuns, generationTasks } from '../../database/index.js'
import type { StructuredTextProvider } from '../../providers/index.js'
import { buildProjectProfileAgentContext } from './context.js'
import { buildProjectProfileAgentSystemPrompt, buildProjectProfileAgentUserPrompt } from './prompt.js'
import {
  ProjectProfileAgentInputSchema,
  ProjectProfileAgentOutputSchema,
  type ProjectProfileAgentResult,
} from './schema.js'

export interface RunProjectProfileAgentParams {
  db: DatabaseClient
  provider: StructuredTextProvider
  input: unknown
}

const AGENT_TYPE = 'ProjectProfileAgent'
const SKILL_NAME = 'project-profile'
const SKILL_VERSION = '1.0.0'
const TASK_TYPE = 'project_profile'

/**
 * Infers a draft project's profile (title/description/genre/visualStyle) from
 * its imported novel chapters. Unlike other agents this one writes no business
 * table: the suggestion lives in the task/run outputJson and is applied to the
 * projects row only after the user confirms it (PATCH /api/projects/:id).
 */
export async function runProjectProfileAgent(
  params: RunProjectProfileAgentParams,
): Promise<ProjectProfileAgentResult> {
  const input = ProjectProfileAgentInputSchema.parse(params.input)
  const now = new Date().toISOString()
  const taskId = input.taskId ?? nanoid()
  const agentRunId = nanoid()

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

    const context = await buildProjectProfileAgentContext(params.db, input)

    const providerResult = await params.provider.generateStructuredJson({
      systemPrompt: buildProjectProfileAgentSystemPrompt(),
      userPrompt: buildProjectProfileAgentUserPrompt(context, input),
      schemaName: 'ProjectProfileAgentOutput',
      schema: ProjectProfileAgentOutputSchema,
      metadata: {
        projectId: input.projectId,
        agentRunId,
        taskId,
      },
    })

    const output = ProjectProfileAgentOutputSchema.parse(providerResult.data)
    const completedAt = new Date().toISOString()
    const outputJson = JSON.stringify(output)

    await params.db.transaction(async (tx) => {
      await tx
        .update(agentRuns)
        .set({
          status: 'completed',
          model: providerResult.model,
          outputJson,
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
          outputJson,
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
