import { nanoid } from 'nanoid'
import { eq } from 'drizzle-orm'
import type { DatabaseClient } from '../../database/index.js'
import { agentRuns, episodes, generationTasks, scripts } from '../../database/index.js'
import type { StructuredTextProvider } from '../../providers/index.js'
import { buildScriptAgentContext } from './context.js'
import { buildScriptAgentSystemPrompt, buildScriptAgentUserPrompt } from './prompt.js'
import {
  ScriptAgentInputSchema,
  ScriptAgentOutputSchema,
  type ScriptAgentInput,
  type ScriptAgentOutput,
  type ScriptAgentResult,
} from './schema.js'

export interface RunScriptAgentParams {
  db: DatabaseClient
  provider: StructuredTextProvider
  input: ScriptAgentInput
}

const AGENT_TYPE = 'ScriptAgent'
const SKILL_NAME = 'script-generation'
const SKILL_VERSION = '1.0.0'
const TASK_TYPE = 'script_generation'

export async function runScriptAgent(params: RunScriptAgentParams): Promise<ScriptAgentResult> {
  const input = ScriptAgentInputSchema.parse(params.input)
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

    const context = await buildScriptAgentContext(params.db, input)

    if (context.existingScript && input.options?.force !== true) {
      throw new Error(`Episode already has script: ${input.episodeId}`)
    }

    const providerResult = await params.provider.generateStructuredJson({
      systemPrompt: buildScriptAgentSystemPrompt(),
      userPrompt: buildScriptAgentUserPrompt(context, input),
      schemaName: 'ScriptAgentOutput',
      schema: ScriptAgentOutputSchema,
      metadata: {
        projectId: input.projectId,
        episodeId: input.episodeId,
        sourceEventIds: context.linkedNovelEvents.map((event) => event.id),
        agentRunId,
        taskId,
      },
    })

    const output = ScriptAgentOutputSchema.parse(providerResult.data)
    validateScriptAgentOutput(output)

    const completedAt = new Date().toISOString()
    const scriptId = context.existingScript?.id ?? nanoid()
    const content = renderScriptContent(output)
    const structuredJson = JSON.stringify(output)

    await params.db.transaction(async (tx) => {
      if (context.existingScript) {
        await tx
          .update(scripts)
          .set({
            title: output.title,
            summary: output.summary,
            openingHook: output.opening_hook,
            endingHook: output.ending_hook,
            content,
            structuredJson,
            status: 'ready',
            updatedAt: completedAt,
          })
          .where(eq(scripts.id, scriptId))
      } else {
        await tx.insert(scripts).values({
          id: scriptId,
          projectId: input.projectId,
          episodeId: input.episodeId,
          title: output.title,
          summary: output.summary,
          openingHook: output.opening_hook,
          endingHook: output.ending_hook,
          content,
          structuredJson,
          status: 'ready',
          createdAt: completedAt,
          updatedAt: completedAt,
        })
      }

      await tx
        .update(episodes)
        .set({
          scriptId,
          openingHook: output.opening_hook,
          endingHook: output.ending_hook,
          status: 'script_ready',
          updatedAt: completedAt,
        })
        .where(eq(episodes.id, input.episodeId))

      await tx
        .update(agentRuns)
        .set({
          status: 'completed',
          model: providerResult.model,
          outputJson: structuredJson,
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
          outputJson: structuredJson,
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
      scriptId,
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

export function validateScriptAgentOutput(output: ScriptAgentOutput) {
  const sectionNumbers = new Set<number>()

  for (const section of output.script_sections) {
    if (sectionNumbers.has(section.section_no)) {
      throw new Error(`Script has duplicate section_no: ${section.section_no}`)
    }

    sectionNumbers.add(section.section_no)
  }

  for (let sectionNo = 1; sectionNo <= output.script_sections.length; sectionNo += 1) {
    if (!sectionNumbers.has(sectionNo)) {
      throw new Error('Script sections must be ordered consecutively from 1')
    }
  }
}

export function renderScriptContent(output: ScriptAgentOutput) {
  const lines = [
    `# ${output.title}`,
    '',
    `Summary: ${output.summary}`,
    `Duration: ${output.duration_seconds}s`,
    `Opening hook: ${output.opening_hook}`,
    `Ending hook: ${output.ending_hook}`,
  ]

  for (const section of [...output.script_sections].sort((a, b) => a.section_no - b.section_no)) {
    lines.push('', `## ${section.section_no}. ${section.type}`)

    if (section.location) {
      lines.push(`Location: ${section.location}`)
    }

    if (section.characters.length > 0) {
      lines.push(`Characters: ${section.characters.join('、')}`)
    }

    if (section.emotion) {
      lines.push(`Emotion: ${section.emotion}`)
    }

    lines.push(`Description: ${section.description}`)

    if (section.narration) {
      lines.push(`Narration: ${section.narration}`)
    }

    for (const dialogue of section.dialogues) {
      const emotion = dialogue.emotion ? `（${dialogue.emotion}）` : ''
      lines.push(`${dialogue.character}${emotion}: ${dialogue.line}`)
    }
  }

  return lines.join('\n')
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
