import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { z } from 'zod/v4'
import type { DatabaseClient } from '../../../packages/database/index.js'
import {
  characters,
  episodeCharacterLinks,
  episodePropLinks,
  episodeSceneLinks,
  episodes,
  generationTasks,
  projects,
  props,
  scenes,
  scripts,
} from '../../../packages/database/index.js'
import {
  ExtractAgentOptionsSchema,
  type ExtractAgentInput,
} from '../../../packages/agents/extract-agent/index.js'
import { ScriptAgentOutputSchema } from '../../../packages/agents/script-agent/index.js'
import type { StructuredTextProvider } from '../../../packages/providers/index.js'
import type { TaskScheduler } from '../../../packages/tasks/index.js'
import type { TaskOrchestration } from './task-orchestration.js'

export const StartAssetExtractionRequestSchema = z.object({
  force: z.boolean().optional(),
  options: ExtractAgentOptionsSchema.omit({ force: true }).optional(),
})

export type StartAssetExtractionRequest = z.infer<typeof StartAssetExtractionRequestSchema>

export class AssetExtractionServiceError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message)
  }
}

export interface AssetExtractionServiceDeps {
  db: DatabaseClient
  provider: StructuredTextProvider
  scheduler: TaskScheduler
}

export async function startAssetExtraction(
  deps: AssetExtractionServiceDeps,
  episodeId: string,
  request: StartAssetExtractionRequest,
  orchestration?: TaskOrchestration & { skipReferenceImages?: boolean },
) {
  const now = new Date().toISOString()
  const input = await buildExtractAgentInput(deps.db, episodeId, request)
  const taskId = nanoid()

  await deps.db.insert(generationTasks).values({
    id: taskId,
    projectId: input.projectId,
    episodeId,
    storyboardId: null,
    taskType: 'asset_extraction',
    provider: deps.provider.name,
    model: input.options?.model ?? deps.provider.model,
    // `skipReferenceImages` is an orchestration payload flag (not a task column) read by the
    // asset_extraction worker handler to suppress the eager character-image backfill.
    inputJson: JSON.stringify({ ...input, taskId, skipReferenceImages: orchestration?.skipReferenceImages ?? false }),
    outputJson: null,
    status: 'pending',
    retryCount: 0,
    jobId: orchestration?.jobId ?? null,
    idempotencyKey: orchestration?.idempotencyKey ?? null,
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

export async function getEpisodeAssets(db: DatabaseClient, episodeId: string) {
  const [episode] = await db.select().from(episodes).where(eq(episodes.id, episodeId)).limit(1)

  if (!episode) {
    return null
  }

  const characterRows = await db
    .select({
      link: episodeCharacterLinks,
      character: characters,
    })
    .from(episodeCharacterLinks)
    .innerJoin(characters, eq(episodeCharacterLinks.characterId, characters.id))
    .where(eq(episodeCharacterLinks.episodeId, episodeId))
    .orderBy(characters.name)

  const sceneRows = await db
    .select({
      link: episodeSceneLinks,
      scene: scenes,
    })
    .from(episodeSceneLinks)
    .innerJoin(scenes, eq(episodeSceneLinks.sceneId, scenes.id))
    .where(eq(episodeSceneLinks.episodeId, episodeId))
    .orderBy(scenes.name)

  const propRows = await db
    .select({
      link: episodePropLinks,
      prop: props,
    })
    .from(episodePropLinks)
    .innerJoin(props, eq(episodePropLinks.propId, props.id))
    .where(eq(episodePropLinks.episodeId, episodeId))
    .orderBy(props.name)

  return {
    episode,
    characters: characterRows.map(({ link, character }) => ({
      link,
      character: serializeCharacter(character),
    })),
    scenes: sceneRows.map(({ link, scene }) => ({
      link,
      scene,
    })),
    props: propRows.map(({ link, prop }) => ({
      link,
      prop,
    })),
  }
}

export async function getProjectCharacters(db: DatabaseClient, projectId: string) {
  const project = await getProject(db, projectId)

  if (!project) {
    return null
  }

  const rows = await db.select().from(characters).where(eq(characters.projectId, projectId)).orderBy(characters.name)
  return { project, characters: rows.map(serializeCharacter) }
}

export async function getCharacter(db: DatabaseClient, characterId: string) {
  const [character] = await db.select().from(characters).where(eq(characters.id, characterId)).limit(1)

  if (!character) {
    return null
  }

  return { character: serializeCharacter(character) }
}

export async function getProjectScenes(db: DatabaseClient, projectId: string) {
  const project = await getProject(db, projectId)

  if (!project) {
    return null
  }

  const rows = await db.select().from(scenes).where(eq(scenes.projectId, projectId)).orderBy(scenes.name)
  return { project, scenes: rows }
}

export async function getScene(db: DatabaseClient, sceneId: string) {
  const [scene] = await db.select().from(scenes).where(eq(scenes.id, sceneId)).limit(1)

  if (!scene) {
    return null
  }

  return { scene: { ...scene, reference_image_url: scene.referenceImageUrl } }
}

export async function getProjectProps(db: DatabaseClient, projectId: string) {
  const project = await getProject(db, projectId)

  if (!project) {
    return null
  }

  const rows = await db.select().from(props).where(eq(props.projectId, projectId)).orderBy(props.name)
  return { project, props: rows }
}

async function buildExtractAgentInput(
  db: DatabaseClient,
  episodeId: string,
  request: StartAssetExtractionRequest,
): Promise<ExtractAgentInput> {
  const [episode] = await db.select().from(episodes).where(eq(episodes.id, episodeId)).limit(1)

  if (!episode) {
    throw new AssetExtractionServiceError(`Episode not found: ${episodeId}`, 404)
  }

  const [project] = await db.select().from(projects).where(eq(projects.id, episode.projectId)).limit(1)

  if (!project) {
    throw new AssetExtractionServiceError(`Project not found: ${episode.projectId}`, 404)
  }

  const [script] = await db.select().from(scripts).where(eq(scripts.episodeId, episodeId)).limit(1)

  if (!script) {
    throw new AssetExtractionServiceError(`Script not found for episode: ${episodeId}`, 404)
  }

  const scriptStructuredJson = parseScriptStructuredJson(script.structuredJson)

  if (await hasEpisodeAssetLinks(db, episodeId) && request.force !== true) {
    throw new AssetExtractionServiceError(`Episode already has extracted assets: ${episodeId}`, 409)
  }

  const existingCharacters = await db.select().from(characters).where(eq(characters.projectId, project.id)).orderBy(characters.name)
  const existingScenes = await db.select().from(scenes).where(eq(scenes.projectId, project.id)).orderBy(scenes.name)
  const existingProps = await db.select().from(props).where(eq(props.projectId, project.id)).orderBy(props.name)

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
    script: {
      id: script.id,
      projectId: script.projectId,
      episodeId: script.episodeId,
      title: script.title,
      summary: script.summary,
      openingHook: script.openingHook,
      endingHook: script.endingHook,
      content: script.content,
      status: script.status,
    },
    scriptStructuredJson,
    projectStyle: {
      title: project.title,
      genre: project.genre,
      targetPlatform: project.targetPlatform,
      visualStyle: project.visualStyle,
      episodeDuration: project.episodeDuration,
    },
    existingCharacters: existingCharacters.map((character) => ({
      id: character.id,
      projectId: character.projectId,
      name: character.name,
      aliasJson: parseStringArray(character.aliasJson),
      role: character.role,
      age: character.age,
      gender: character.gender,
      appearance: character.appearance,
      personality: character.personality,
      background: character.background,
      relationshipJson: parseUnknownArray(character.relationshipJson),
      referenceImageUrl: character.referenceImageUrl,
      voiceId: character.voiceId,
      status: character.status,
    })),
    existingScenes: existingScenes.map((scene) => ({
      id: scene.id,
      projectId: scene.projectId,
      name: scene.name,
      description: scene.description,
      locationType: scene.locationType,
      visualStyle: scene.visualStyle,
      visualPrompt: scene.visualPrompt,
      referenceImageUrl: scene.referenceImageUrl,
      status: scene.status,
    })),
    existingProps: existingProps.map((prop) => ({
      id: prop.id,
      projectId: prop.projectId,
      name: prop.name,
      description: prop.description,
      significance: prop.significance,
      visualPrompt: prop.visualPrompt,
      referenceImageUrl: prop.referenceImageUrl,
      status: prop.status,
    })),
    options: {
      ...request.options,
      force: request.force ?? false,
    },
  }
}

async function hasEpisodeAssetLinks(db: DatabaseClient, episodeId: string) {
  const [characterLink] = await db
    .select({ id: episodeCharacterLinks.id })
    .from(episodeCharacterLinks)
    .where(eq(episodeCharacterLinks.episodeId, episodeId))
    .limit(1)

  if (characterLink) {
    return true
  }

  const [sceneLink] = await db
    .select({ id: episodeSceneLinks.id })
    .from(episodeSceneLinks)
    .where(eq(episodeSceneLinks.episodeId, episodeId))
    .limit(1)

  if (sceneLink) {
    return true
  }

  const [propLink] = await db
    .select({ id: episodePropLinks.id })
    .from(episodePropLinks)
    .where(eq(episodePropLinks.episodeId, episodeId))
    .limit(1)

  return Boolean(propLink)
}

async function getProject(db: DatabaseClient, projectId: string) {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1)
  return project ?? null
}

function parseScriptStructuredJson(value: string) {
  try {
    return ScriptAgentOutputSchema.parse(JSON.parse(value))
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new AssetExtractionServiceError('Script structured_json is invalid', 400)
    }

    throw new AssetExtractionServiceError('Script structured_json is not valid JSON', 400)
  }
}

function serializeCharacter(character: typeof characters.$inferSelect) {
  return {
    ...character,
    aliasJson: parseStringArray(character.aliasJson),
    relationshipJson: parseUnknownArray(character.relationshipJson),
    reference_image_url: character.referenceImageUrl,
  }
}

function parseStringArray(value: string) {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

function parseUnknownArray(value: string) {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}
