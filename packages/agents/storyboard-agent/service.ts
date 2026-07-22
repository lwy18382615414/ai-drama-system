import { eq, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { DatabaseClient } from '../../database/index.js'
import { agentRuns, episodePipelineStates, episodes, generationTasks, storyboards } from '../../database/index.js'
import type { StructuredTextProvider } from '../../providers/index.js'
import { buildStoryboardAgentContext, type StoryboardAgentContext } from './context.js'
import { buildStoryboardAgentSystemPrompt, buildStoryboardAgentUserPrompt } from './prompt.js'
import {
  StoryboardAgentInputSchema,
  StoryboardAgentOutputSchema,
  type StoryboardAgentInput,
  type StoryboardAgentOutput,
  type StoryboardAgentResult,
} from './schema.js'

export interface RunStoryboardAgentParams {
  db: DatabaseClient
  provider: StructuredTextProvider
  input: StoryboardAgentInput
}

const AGENT_TYPE = 'StoryboardAgent'
const SKILL_NAME = 'storyboard-generation'
const SKILL_VERSION = '1.0.0'
const TASK_TYPE = 'storyboard_generation'

export async function runStoryboardAgent(params: RunStoryboardAgentParams): Promise<StoryboardAgentResult> {
  const input = StoryboardAgentInputSchema.parse(params.input)
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
        episodeId: input.episodeId,
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
      episodeId: input.episodeId,
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

    const context = await buildStoryboardAgentContext(params.db, input)

    if (context.existingStoryboards.length > 0 && input.options?.force !== true) {
      throw new Error(`Episode already has storyboards: ${input.episodeId}`)
    }

    const providerResult = await params.provider.generateStructuredJson({
      systemPrompt: buildStoryboardAgentSystemPrompt(),
      userPrompt: buildStoryboardAgentUserPrompt(context, input),
      schemaName: 'StoryboardAgentOutput',
      schema: StoryboardAgentOutputSchema,
      metadata: {
        projectId: input.projectId,
        episodeId: input.episodeId,
        scriptId: context.script.id,
        sceneIds: context.scenes.map((scene) => scene.id),
        characterIds: context.characters.map((character) => character.id),
        propIds: context.props.map((prop) => prop.id),
        agentRunId,
        taskId,
      },
    })

    const output = StoryboardAgentOutputSchema.parse(providerResult.data)
    validateStoryboardAgentOutput(output, context)

    const completedAt = new Date().toISOString()
    const outputJson = JSON.stringify(output)
    const storyboardIds: string[] = []

    await params.db.transaction(async (tx) => {
      if (input.options?.force === true) {
        await tx.delete(storyboards).where(eq(storyboards.episodeId, input.episodeId))
      }

      for (const shot of [...output.storyboards].sort((a, b) => a.shot_no - b.shot_no)) {
        const storyboardId = nanoid()
        storyboardIds.push(storyboardId)

        await tx.insert(storyboards).values({
          id: storyboardId,
          projectId: input.projectId,
          episodeId: input.episodeId,
          shotNo: shot.shot_no,
          duration: shot.duration,
          sceneId: shot.scene_id,
          characterIdsJson: JSON.stringify(shot.character_ids),
          propIdsJson: JSON.stringify(shot.prop_ids),
          scriptSectionNo: shot.script_section_no ?? null,
          shotType: shot.shot_type,
          cameraAngle: shot.camera_angle ?? null,
          cameraMovement: shot.camera_movement ?? null,
          action: shot.action,
          dialogueJson: JSON.stringify(shot.dialogue),
          narration: shot.narration ?? null,
          emotion: shot.emotion ?? null,
          imagePrompt: shot.image_prompt,
          videoPrompt: shot.video_prompt,
          firstFrameImageUrl: null,
          lastFrameImageUrl: null,
          videoUrl: null,
          ttsAudioUrl: null,
          subtitleUrl: null,
          composedVideoUrl: null,
          status: 'draft',
          createdAt: completedAt,
          updatedAt: completedAt,
        })
      }

      await tx
        .update(episodes)
        .set({
          status: 'storyboard_ready',
          updatedAt: completedAt,
        })
        .where(eq(episodes.id, input.episodeId))

      await tx.insert(episodePipelineStates).values({ episodeId: input.episodeId, updatedAt: completedAt }).onConflictDoNothing()
      await tx
        .update(episodePipelineStates)
        .set({
          storyboardRevision: sql`${episodePipelineStates.storyboardRevision} + 1`,
          storyboardsStale: false,
          imagesStale: true,
          updatedAt: completedAt,
        })
        .where(eq(episodePipelineStates.episodeId, input.episodeId))

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
      storyboardIds,
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

export function validateStoryboardAgentOutput(output: StoryboardAgentOutput, context: StoryboardAgentContext) {
  const shotNumbers = new Set<number>()
  const sceneIds = new Set(context.scenes.map((scene) => scene.id))
  const characterIds = new Set(context.characters.map((character) => character.id))
  const propIds = new Set(context.props.map((prop) => prop.id))
  const scriptSectionNos = new Set(context.scriptStructuredJson.script_sections.map((section) => section.section_no))

  for (const shot of output.storyboards) {
    if (shotNumbers.has(shot.shot_no)) {
      throw new Error(`Storyboard has duplicate shot_no: ${shot.shot_no}`)
    }

    shotNumbers.add(shot.shot_no)

    if (!sceneIds.has(shot.scene_id)) {
      throw new Error(`Storyboard shot ${shot.shot_no} references unknown scene_id: ${shot.scene_id}`)
    }

    for (const characterId of shot.character_ids) {
      if (!characterIds.has(characterId)) {
        throw new Error(`Storyboard shot ${shot.shot_no} references unknown character_id: ${characterId}`)
      }
    }

    for (const propId of shot.prop_ids) {
      if (!propIds.has(propId)) {
        throw new Error(`Storyboard shot ${shot.shot_no} references unknown prop_id: ${propId}`)
      }
    }

    if (shot.script_section_no !== undefined && shot.script_section_no !== null && !scriptSectionNos.has(shot.script_section_no)) {
      throw new Error(`Storyboard shot ${shot.shot_no} references unknown script_section_no: ${shot.script_section_no}`)
    }
  }

  for (let shotNo = 1; shotNo <= output.storyboards.length; shotNo += 1) {
    if (!shotNumbers.has(shotNo)) {
      throw new Error('Storyboard shots must be ordered consecutively from 1')
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
