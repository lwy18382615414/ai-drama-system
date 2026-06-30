import { nanoid } from 'nanoid'
import { eq } from 'drizzle-orm'
import type { DatabaseClient } from '../../database/index.js'
import { agentRuns, episodeEventLinks, episodes, generationTasks } from '../../database/index.js'
import type { StructuredTextProvider } from '../../providers/index.js'
import { buildEpisodePlannerContext } from './context.js'
import { buildEpisodePlannerSystemPrompt, buildEpisodePlannerUserPrompt } from './prompt.js'
import {
  EpisodePlannerInputSchema,
  EpisodePlannerOutputSchema,
  type EpisodePlannerInput,
  type EpisodePlannerOutput,
  type EpisodePlannerResult,
  type EpisodePlannerSourceEvent,
} from './schema.js'

export interface RunEpisodePlannerAgentParams {
  db: DatabaseClient
  provider: StructuredTextProvider
  input: EpisodePlannerInput
}

const AGENT_TYPE = 'EpisodePlannerAgent'
const SKILL_NAME = 'episode-planning'
const SKILL_VERSION = '1.0.0'
const TASK_TYPE = 'episode_planning'

export async function runEpisodePlannerAgent(
  params: RunEpisodePlannerAgentParams,
): Promise<EpisodePlannerResult> {
  const input = EpisodePlannerInputSchema.parse(params.input)
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

    const context = await buildEpisodePlannerContext(params.db, input)

    if (context.existingEpisodes.length > 0) {
      throw new Error(`Project already has episodes: ${input.projectId}`)
    }

    const providerResult = await params.provider.generateStructuredJson({
      systemPrompt: buildEpisodePlannerSystemPrompt(),
      userPrompt: buildEpisodePlannerUserPrompt(context, input),
      schemaName: 'EpisodePlannerOutput',
      schema: EpisodePlannerOutputSchema,
      metadata: {
        projectId: input.projectId,
        chapterIds: input.chapterIds,
        sourceEventIds: context.novelEvents.map((event) => event.id),
        agentRunId,
        taskId,
      },
    })

    const output = EpisodePlannerOutputSchema.parse(providerResult.data)
    validateEpisodePlannerOutput(output, context.novelEvents)

    const completedAt = new Date().toISOString()

    await params.db.transaction(async (tx) => {
      const episodeRows = output.episodes.map((episode, index) => ({
        id: nanoid(),
        projectId: input.projectId,
        episodeNo: index + 1,
        title: episode.title,
        summary: episode.summary,
        openingHook: episode.opening_hook,
        endingHook: episode.ending_hook,
        scriptId: null,
        videoUrl: null,
        status: 'planned',
        createdAt: completedAt,
        updatedAt: completedAt,
      }))

      await tx.insert(episodes).values(episodeRows)

      const linkRows = output.episodes.flatMap((episode, episodeIndex) =>
        episode.source_event_links.map((link) => ({
          id: nanoid(),
          projectId: input.projectId,
          episodeId: episodeRows[episodeIndex].id,
          novelEventId: link.novel_event_id,
          orderInEpisode: link.order_in_episode,
          usageType: link.usage_type,
          createdAt: completedAt,
          updatedAt: completedAt,
        })),
      )

      await tx.insert(episodeEventLinks).values(linkRows)

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

    return {
      success: false,
      taskId,
      agentRunId,
      error: errorMessage,
    }
  }
}

function validateEpisodePlannerOutput(
  output: EpisodePlannerOutput,
  sourceEvents: EpisodePlannerSourceEvent[],
) {
  const sourceEventIds = new Set(sourceEvents.map((event) => event.id))
  const linkedEventIds = new Set<string>()

  for (const [episodeIndex, episode] of output.episodes.entries()) {
    const orderValues = new Set<number>()

    for (const link of episode.source_event_links) {
      if (!sourceEventIds.has(link.novel_event_id)) {
        throw new Error(`Episode plan references unknown novel_event_id: ${link.novel_event_id}`)
      }

      if (linkedEventIds.has(link.novel_event_id)) {
        throw new Error(`Episode plan links novel_event_id more than once: ${link.novel_event_id}`)
      }

      if (orderValues.has(link.order_in_episode)) {
        throw new Error(`Episode ${episodeIndex + 1} has duplicate order_in_episode: ${link.order_in_episode}`)
      }

      linkedEventIds.add(link.novel_event_id)
      orderValues.add(link.order_in_episode)
    }

    for (let order = 1; order <= episode.source_event_links.length; order += 1) {
      if (!orderValues.has(order)) {
        throw new Error(`Episode ${episodeIndex + 1} source_event_links must be ordered consecutively from 1`)
      }
    }
  }

  if (linkedEventIds.size !== sourceEventIds.size) {
    const missingEventIds = [...sourceEventIds].filter((eventId) => !linkedEventIds.has(eventId))
    throw new Error(`Episode plan is missing novel_event_id links: ${missingEventIds.join(', ')}`)
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
