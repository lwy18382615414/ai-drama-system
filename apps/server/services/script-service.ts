import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { z } from 'zod/v4'
import type { DatabaseClient } from '../../../packages/database/index.js'
import {
  episodeEventLinks,
  episodes,
  generationTasks,
  novelEvents,
  projects,
  scripts,
} from '../../../packages/database/index.js'
import {
  renderScriptContent,
  ScriptAgentOptionsSchema,
  ScriptAgentOutputSchema,
  type ScriptAgentInput,
} from '../../../packages/agents/script-agent/index.js'
import type { StructuredTextProvider } from '../../../packages/providers/index.js'
import type { TaskScheduler } from '../../../packages/tasks/index.js'

export const StartScriptGenerationRequestSchema = z.object({
  force: z.boolean().optional(),
  options: ScriptAgentOptionsSchema.omit({ force: true }).optional(),
})

export const PatchScriptRequestSchema = z.object({
  title: z.string().min(1).optional(),
  summary: z.string().min(1).optional(),
  opening_hook: z.string().nullable().optional(),
  ending_hook: z.string().nullable().optional(),
  content: z.string().min(1).optional(),
  structured_json: z.unknown().optional(),
  status: z.string().min(1).optional(),
})

export type StartScriptGenerationRequest = z.infer<typeof StartScriptGenerationRequestSchema>
export type PatchScriptRequest = z.infer<typeof PatchScriptRequestSchema>

export class ScriptServiceError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message)
  }
}

export interface ScriptServiceDeps {
  db: DatabaseClient
  provider: StructuredTextProvider
  scheduler: TaskScheduler
}

export async function startScriptGeneration(
  deps: ScriptServiceDeps,
  episodeId: string,
  request: StartScriptGenerationRequest,
) {
  const now = new Date().toISOString()
  const input = await buildScriptAgentInput(deps.db, episodeId, request)
  const taskId = nanoid()

  await deps.db.insert(generationTasks).values({
    id: taskId,
    projectId: input.projectId,
    episodeId,
    storyboardId: null,
    taskType: 'script_generation',
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

  void deps.scheduler.announce(taskId)
  deps.scheduler.notify()

  return { taskId, status: 'pending' as const }
}

export async function getEpisodeScript(db: DatabaseClient, episodeId: string) {
  const [episode] = await db.select().from(episodes).where(eq(episodes.id, episodeId)).limit(1)

  if (!episode) {
    return null
  }

  const [script = null] = await db.select().from(scripts).where(eq(scripts.episodeId, episodeId)).limit(1)

  return { episode, script }
}

export async function updateScript(db: DatabaseClient, scriptId: string, request: PatchScriptRequest) {
  const [existing] = await db.select().from(scripts).where(eq(scripts.id, scriptId)).limit(1)

  if (!existing) {
    throw new ScriptServiceError(`Script not found: ${scriptId}`, 404)
  }

  const now = new Date().toISOString()
  const updates: {
    title?: string
    summary?: string
    openingHook?: string | null
    endingHook?: string | null
    content?: string
    structuredJson?: string
    status?: string
    updatedAt: string
  } = { updatedAt: now }

  if (request.structured_json !== undefined) {
    const structuredOutput = ScriptAgentOutputSchema.parse(request.structured_json)
    updates.title = structuredOutput.title
    updates.summary = structuredOutput.summary
    updates.openingHook = structuredOutput.opening_hook
    updates.endingHook = structuredOutput.ending_hook
    updates.structuredJson = JSON.stringify(structuredOutput)
    updates.content = renderScriptContent(structuredOutput)
  }

  if (request.title !== undefined) {
    updates.title = request.title
  }

  if (request.summary !== undefined) {
    updates.summary = request.summary
  }

  if (request.opening_hook !== undefined) {
    updates.openingHook = request.opening_hook
  }

  if (request.ending_hook !== undefined) {
    updates.endingHook = request.ending_hook
  }

  if (request.content !== undefined) {
    updates.content = request.content
  }

  if (request.status !== undefined) {
    updates.status = request.status
  }

  if (Object.keys(updates).length === 1) {
    throw new ScriptServiceError('Script update requires at least one field', 400)
  }

  await db.update(scripts).set(updates).where(eq(scripts.id, scriptId))

  const [script] = await db.select().from(scripts).where(eq(scripts.id, scriptId)).limit(1)
  return script
}

async function buildScriptAgentInput(
  db: DatabaseClient,
  episodeId: string,
  request: StartScriptGenerationRequest,
): Promise<ScriptAgentInput> {
  const [episode] = await db.select().from(episodes).where(eq(episodes.id, episodeId)).limit(1)

  if (!episode) {
    throw new ScriptServiceError(`Episode not found: ${episodeId}`, 404)
  }

  const [project] = await db.select().from(projects).where(eq(projects.id, episode.projectId)).limit(1)

  if (!project) {
    throw new ScriptServiceError(`Project not found: ${episode.projectId}`, 404)
  }

  const [existingScript] = await db.select({ id: scripts.id }).from(scripts).where(eq(scripts.episodeId, episodeId)).limit(1)

  if (existingScript && request.force !== true) {
    throw new ScriptServiceError(`Episode already has script: ${episodeId}`, 409)
  }

  const sourceRows = await db
    .select({
      link: episodeEventLinks,
      event: novelEvents,
    })
    .from(episodeEventLinks)
    .innerJoin(novelEvents, eq(episodeEventLinks.novelEventId, novelEvents.id))
    .where(eq(episodeEventLinks.episodeId, episodeId))
    .orderBy(episodeEventLinks.orderInEpisode)

  if (sourceRows.length === 0) {
    throw new ScriptServiceError(`Episode has no linked novel events: ${episodeId}`, 400)
  }

  return {
    projectId: project.id,
    episodeId,
    episode: {
      id: episode.id,
      projectId: episode.projectId,
      episodeNo: episode.episodeNo,
      title: episode.title,
      summary: episode.summary,
      openingHook: episode.openingHook,
      endingHook: episode.endingHook,
      status: episode.status,
    },
    episodeEventLinks: sourceRows.map(({ link }) => ({
      id: link.id,
      projectId: link.projectId,
      episodeId: link.episodeId,
      novelEventId: link.novelEventId,
      orderInEpisode: link.orderInEpisode,
      usageType: link.usageType,
    })),
    linkedNovelEvents: sourceRows.map(({ event }) => ({
      id: event.id,
      projectId: event.projectId,
      chapterId: event.chapterId,
      eventNo: event.eventNo,
      eventType: event.eventType,
      summary: event.summary,
      detail: event.detail,
      characters: parseCharacters(event.charactersJson),
      location: event.location,
      timeHint: event.timeHint,
      emotionTone: event.emotionTone,
      conflictLevel: event.conflictLevel,
      importance: event.importance,
    })),
    styleConfig: {
      title: project.title,
      genre: project.genre,
      targetPlatform: project.targetPlatform,
      visualStyle: project.visualStyle,
      episodeDuration: project.episodeDuration,
    },
    options: {
      ...request.options,
      force: request.force ?? false,
    },
  }
}

function parseCharacters(charactersJson: string) {
  try {
    const parsed = JSON.parse(charactersJson)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}
