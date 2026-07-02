import { and, eq, inArray } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { z } from 'zod/v4'
import type { DatabaseClient } from '../../../packages/database/index.js'
import {
  assets,
  characters,
  episodeCharacterLinks,
  episodeSceneLinks,
  episodes,
  generationTasks,
  projects,
  props,
  scenes,
  storyboards,
} from '../../../packages/database/index.js'
import type { ImageGenerationRequest, ImageProvider } from '../../../packages/providers/index.js'

export const ImageTargetTypeSchema = z.enum([
  'character_reference_image',
  'scene_reference_image',
  'storyboard_first_frame',
])

export const ImageGenerationOptionsSchema = z
  .object({
    negative_prompt: z.string().min(1).optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    style: z.string().min(1).optional(),
  })
  .optional()

export const StartImageGenerationRequestSchema = z.object({
  target_type: ImageTargetTypeSchema,
  target_id: z.string().min(1),
  prompt_override: z.string().min(1).optional(),
  force: z.boolean().optional(),
  options: ImageGenerationOptionsSchema,
})

export const StartCharacterReferenceImageRequestSchema = z.object({
  force: z.boolean().optional(),
  options: ImageGenerationOptionsSchema,
})

export const StartSceneReferenceImageRequestSchema = z.object({
  force: z.boolean().optional(),
  options: ImageGenerationOptionsSchema,
})

export const StartStoryboardFirstFrameRequestSchema = z.object({
  force: z.boolean().optional(),
  options: ImageGenerationOptionsSchema,
})

export const BatchImageGenerationRequestSchema = z.object({
  force: z.boolean().optional(),
  options: ImageGenerationOptionsSchema,
})

export type ImageTargetType = z.infer<typeof ImageTargetTypeSchema>
export type StartImageGenerationRequest = z.infer<typeof StartImageGenerationRequestSchema>
export type StartCharacterReferenceImageRequest = z.infer<typeof StartCharacterReferenceImageRequestSchema>
export type StartSceneReferenceImageRequest = z.infer<typeof StartSceneReferenceImageRequestSchema>
export type StartStoryboardFirstFrameRequest = z.infer<typeof StartStoryboardFirstFrameRequestSchema>
export type BatchImageGenerationRequest = z.infer<typeof BatchImageGenerationRequestSchema>

type ImageGenerationOptions = StartImageGenerationRequest['options']

export interface BatchTargetResult {
  targetId: string
  status: 'completed' | 'skipped' | 'failed'
  taskId?: string
  imageUrl?: string
  error?: string
}

export interface BatchImageGenerationSummary {
  total: number
  completed: number
  skipped: number
  failed: number
}

export interface BatchImageGenerationResult {
  episodeId: string
  targetType: ImageTargetType
  summary: BatchImageGenerationSummary
  results: BatchTargetResult[]
}

export interface ImageAssetStatusCounts {
  total: number
  completed: number
  missing: number
  failed: number
}

export interface EpisodeImageGenerationStatus {
  episodeId: string
  characters: ImageAssetStatusCounts
  scenes: ImageAssetStatusCounts
  storyboardFirstFrames: ImageAssetStatusCounts
}

export class ImageGenerationServiceError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message)
  }
}

export interface ImageGenerationServiceDeps {
  db: DatabaseClient
  imageProvider: ImageProvider
}

interface ResolvedImageTarget {
  projectId: string
  targetType: ImageTargetType
  targetId: string
  prompt: string
  existingUrl: string | null
  episodeId?: string | null
  storyboardId?: string | null
}

export async function startCharacterReferenceImageGeneration(
  deps: ImageGenerationServiceDeps,
  characterId: string,
  request: StartCharacterReferenceImageRequest,
) {
  const [character] = await deps.db
    .select({ projectId: characters.projectId })
    .from(characters)
    .where(eq(characters.id, characterId))
    .limit(1)

  if (!character) {
    throw new ImageGenerationServiceError(`Character not found: ${characterId}`, 404)
  }

  return startImageGeneration(deps, character.projectId, {
    target_type: 'character_reference_image',
    target_id: characterId,
    force: request.force,
    options: request.options,
  })
}

export async function startSceneReferenceImageGeneration(
  deps: ImageGenerationServiceDeps,
  sceneId: string,
  request: StartSceneReferenceImageRequest,
) {
  const [scene] = await deps.db
    .select({ projectId: scenes.projectId })
    .from(scenes)
    .where(eq(scenes.id, sceneId))
    .limit(1)

  if (!scene) {
    throw new ImageGenerationServiceError(`Scene not found: ${sceneId}`, 404)
  }

  return startImageGeneration(deps, scene.projectId, {
    target_type: 'scene_reference_image',
    target_id: sceneId,
    force: request.force,
    options: request.options,
  })
}

export async function startStoryboardFirstFrameGeneration(
  deps: ImageGenerationServiceDeps,
  storyboardId: string,
  request: StartStoryboardFirstFrameRequest,
) {
  const [storyboard] = await deps.db
    .select({ projectId: storyboards.projectId })
    .from(storyboards)
    .where(eq(storyboards.id, storyboardId))
    .limit(1)

  if (!storyboard) {
    throw new ImageGenerationServiceError(`Storyboard not found: ${storyboardId}`, 404)
  }

  return startImageGeneration(deps, storyboard.projectId, {
    target_type: 'storyboard_first_frame',
    target_id: storyboardId,
    force: request.force,
    options: request.options,
  })
}

export async function startImageGeneration(
  deps: ImageGenerationServiceDeps,
  projectId: string,
  request: StartImageGenerationRequest,
) {
  const [project] = await deps.db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).limit(1)

  if (!project) {
    throw new ImageGenerationServiceError(`Project not found: ${projectId}`, 404)
  }

  const target = await resolveImageTarget(deps.db, projectId, request)

  if (request.force !== true) {
    if (target.existingUrl) {
      throw new ImageGenerationServiceError(`Target already has generated image: ${target.targetId}`, 409)
    }

    const [existingAsset] = await deps.db
      .select({ id: assets.id })
      .from(assets)
      .where(
        and(
          eq(assets.projectId, projectId),
          eq(assets.targetType, target.targetType),
          eq(assets.targetId, target.targetId),
          eq(assets.status, 'active'),
        ),
      )
      .limit(1)

    if (existingAsset) {
      throw new ImageGenerationServiceError(`Target already has active image asset: ${target.targetId}`, 409)
    }
  }

  const taskId = await insertPendingImageTask(deps, {
    projectId,
    targetType: target.targetType,
    targetId: target.targetId,
    prompt: target.prompt,
    options: request.options,
    force: request.force,
    episodeId: target.episodeId ?? null,
    storyboardId: target.storyboardId ?? null,
  })

  setTimeout(() => {
    void executeImageGeneration(deps, {
      taskId,
      projectId,
      targetType: target.targetType,
      targetId: target.targetId,
      prompt: target.prompt,
      options: request.options ?? {},
      force: request.force ?? false,
    })
  }, 0)

  return { taskId, status: 'pending' as const }
}

async function insertPendingImageTask(
  deps: ImageGenerationServiceDeps,
  params: {
    projectId: string
    targetType: ImageTargetType
    targetId: string
    prompt: string
    options?: ImageGenerationOptions
    force?: boolean
    episodeId?: string | null
    storyboardId?: string | null
  },
): Promise<string> {
  const now = new Date().toISOString()
  const taskId = nanoid()
  const input = {
    projectId: params.projectId,
    targetType: params.targetType,
    targetId: params.targetId,
    prompt: params.prompt,
    options: params.options ?? {},
    force: params.force ?? false,
    taskId,
  }

  await deps.db.insert(generationTasks).values({
    id: taskId,
    projectId: params.projectId,
    episodeId: params.episodeId ?? null,
    storyboardId: params.storyboardId ?? null,
    targetType: params.targetType,
    targetId: params.targetId,
    taskType: 'image_generation',
    provider: deps.imageProvider.name,
    model: deps.imageProvider.model,
    inputJson: JSON.stringify(input),
    outputJson: null,
    status: 'pending',
    retryCount: 0,
    errorMessage: null,
    startedAt: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  })

  return taskId
}

interface BatchTargetSpec {
  targetId: string
  prompt: string
  existingUrl: string | null
  episodeId?: string | null
  storyboardId?: string | null
}

async function generateBatch(
  deps: ImageGenerationServiceDeps,
  params: {
    episodeId: string
    projectId: string
    targetType: ImageTargetType
    force: boolean
    options?: ImageGenerationOptions
    specs: BatchTargetSpec[]
  },
): Promise<BatchImageGenerationResult> {
  const results: BatchTargetResult[] = []

  for (const spec of params.specs) {
    const result = await generateOneTarget(deps, {
      projectId: params.projectId,
      targetType: params.targetType,
      targetId: spec.targetId,
      prompt: spec.prompt,
      existingUrl: spec.existingUrl,
      force: params.force,
      options: params.options,
      episodeId: spec.episodeId ?? params.episodeId,
      storyboardId: spec.storyboardId,
    })
    results.push(result)
  }

  return {
    episodeId: params.episodeId,
    targetType: params.targetType,
    summary: {
      total: results.length,
      completed: results.filter((r) => r.status === 'completed').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
      failed: results.filter((r) => r.status === 'failed').length,
    },
    results,
  }
}

async function generateOneTarget(
  deps: ImageGenerationServiceDeps,
  params: {
    projectId: string
    targetType: ImageTargetType
    targetId: string
    prompt: string
    existingUrl: string | null
    force: boolean
    options?: ImageGenerationOptions
    episodeId?: string | null
    storyboardId?: string | null
  },
): Promise<BatchTargetResult> {
  if (params.force !== true && params.existingUrl) {
    return { targetId: params.targetId, status: 'skipped' }
  }

  const taskId = await insertPendingImageTask(deps, {
    projectId: params.projectId,
    targetType: params.targetType,
    targetId: params.targetId,
    prompt: params.prompt,
    options: params.options,
    force: params.force,
    episodeId: params.episodeId ?? null,
    storyboardId: params.storyboardId ?? null,
  })

  const outcome = await executeImageGeneration(deps, {
    taskId,
    projectId: params.projectId,
    targetType: params.targetType,
    targetId: params.targetId,
    prompt: params.prompt,
    options: params.options ?? {},
    force: params.force,
  })

  if (outcome.success) {
    return { targetId: params.targetId, status: 'completed', taskId, imageUrl: outcome.imageUrl }
  }

  return { targetId: params.targetId, status: 'failed', taskId, error: outcome.error }
}

async function resolveEpisode(db: DatabaseClient, episodeId: string) {
  const [episode] = await db
    .select({ id: episodes.id, projectId: episodes.projectId })
    .from(episodes)
    .where(eq(episodes.id, episodeId))
    .limit(1)

  return episode ?? null
}

export async function generateEpisodeCharacterImages(
  deps: ImageGenerationServiceDeps,
  episodeId: string,
  request: BatchImageGenerationRequest,
): Promise<BatchImageGenerationResult> {
  const episode = await resolveEpisode(deps.db, episodeId)

  if (!episode) {
    throw new ImageGenerationServiceError(`Episode not found: ${episodeId}`, 404)
  }

  const [project] = await deps.db
    .select({ visualStyle: projects.visualStyle })
    .from(projects)
    .where(eq(projects.id, episode.projectId))
    .limit(1)

  const characterRows = await deps.db
    .select({ character: characters })
    .from(episodeCharacterLinks)
    .innerJoin(characters, eq(episodeCharacterLinks.characterId, characters.id))
    .where(eq(episodeCharacterLinks.episodeId, episodeId))
    .orderBy(characters.name)

  const specs: BatchTargetSpec[] = characterRows.map(({ character }) => ({
    targetId: character.id,
    existingUrl: character.referenceImageUrl,
    prompt: compactPrompt([
      character.name,
      character.role,
      character.appearance,
      character.personality,
      project?.visualStyle ? `Project visual style: ${project.visualStyle}` : null,
    ]),
  }))

  return generateBatch(deps, {
    episodeId,
    projectId: episode.projectId,
    targetType: 'character_reference_image',
    force: request.force ?? false,
    options: request.options,
    specs,
  })
}

export async function generateEpisodeSceneImages(
  deps: ImageGenerationServiceDeps,
  episodeId: string,
  request: BatchImageGenerationRequest,
): Promise<BatchImageGenerationResult> {
  const episode = await resolveEpisode(deps.db, episodeId)

  if (!episode) {
    throw new ImageGenerationServiceError(`Episode not found: ${episodeId}`, 404)
  }

  const [project] = await deps.db
    .select({ visualStyle: projects.visualStyle })
    .from(projects)
    .where(eq(projects.id, episode.projectId))
    .limit(1)

  const sceneRows = await deps.db
    .select({ scene: scenes })
    .from(episodeSceneLinks)
    .innerJoin(scenes, eq(episodeSceneLinks.sceneId, scenes.id))
    .where(eq(episodeSceneLinks.episodeId, episodeId))
    .orderBy(scenes.name)

  const specs: BatchTargetSpec[] = sceneRows.map(({ scene }) => ({
    targetId: scene.id,
    existingUrl: scene.referenceImageUrl,
    prompt: compactPrompt([
      scene.visualPrompt,
      scene.name,
      scene.description,
      scene.locationType,
      scene.visualStyle,
      project?.visualStyle ? `Project visual style: ${project.visualStyle}` : null,
    ]),
  }))

  return generateBatch(deps, {
    episodeId,
    projectId: episode.projectId,
    targetType: 'scene_reference_image',
    force: request.force ?? false,
    options: request.options,
    specs,
  })
}

export async function generateEpisodeStoryboardFirstFrames(
  deps: ImageGenerationServiceDeps,
  episodeId: string,
  request: BatchImageGenerationRequest,
): Promise<BatchImageGenerationResult> {
  const episode = await resolveEpisode(deps.db, episodeId)

  if (!episode) {
    throw new ImageGenerationServiceError(`Episode not found: ${episodeId}`, 404)
  }

  const storyboardRows = await deps.db
    .select()
    .from(storyboards)
    .where(eq(storyboards.episodeId, episodeId))
    .orderBy(storyboards.shotNo)

  const specs: BatchTargetSpec[] = []
  for (const storyboard of storyboardRows) {
    specs.push({
      targetId: storyboard.id,
      existingUrl: storyboard.firstFrameImageUrl,
      prompt: await composeStoryboardFirstFramePrompt(deps.db, episode.projectId, storyboard),
      episodeId: storyboard.episodeId,
      storyboardId: storyboard.id,
    })
  }

  return generateBatch(deps, {
    episodeId,
    projectId: episode.projectId,
    targetType: 'storyboard_first_frame',
    force: request.force ?? false,
    options: request.options,
    specs,
  })
}

export async function generateAllEpisodeImages(
  deps: ImageGenerationServiceDeps,
  episodeId: string,
  request: BatchImageGenerationRequest,
) {
  const episode = await resolveEpisode(deps.db, episodeId)

  if (!episode) {
    throw new ImageGenerationServiceError(`Episode not found: ${episodeId}`, 404)
  }

  const charactersResult = await generateEpisodeCharacterImages(deps, episodeId, request)
  const scenesResult = await generateEpisodeSceneImages(deps, episodeId, request)
  const storyboardFirstFramesResult = await generateEpisodeStoryboardFirstFrames(deps, episodeId, request)

  return {
    episodeId,
    characters: charactersResult,
    scenes: scenesResult,
    storyboardFirstFrames: storyboardFirstFramesResult,
  }
}

export async function getEpisodeImageGenerationStatus(
  db: DatabaseClient,
  episodeId: string,
): Promise<EpisodeImageGenerationStatus | null> {
  const episode = await resolveEpisode(db, episodeId)

  if (!episode) {
    return null
  }

  const characterRows = await db
    .select({ id: characters.id, url: characters.referenceImageUrl })
    .from(episodeCharacterLinks)
    .innerJoin(characters, eq(episodeCharacterLinks.characterId, characters.id))
    .where(eq(episodeCharacterLinks.episodeId, episodeId))

  const sceneRows = await db
    .select({ id: scenes.id, url: scenes.referenceImageUrl })
    .from(episodeSceneLinks)
    .innerJoin(scenes, eq(episodeSceneLinks.sceneId, scenes.id))
    .where(eq(episodeSceneLinks.episodeId, episodeId))

  const storyboardRows = await db
    .select({ id: storyboards.id, url: storyboards.firstFrameImageUrl })
    .from(storyboards)
    .where(eq(storyboards.episodeId, episodeId))

  const failedTaskRows = await db
    .select({ targetType: generationTasks.targetType, targetId: generationTasks.targetId })
    .from(generationTasks)
    .where(
      and(
        eq(generationTasks.episodeId, episodeId),
        eq(generationTasks.taskType, 'image_generation'),
        eq(generationTasks.status, 'failed'),
      ),
    )

  return {
    episodeId,
    characters: buildStatusCounts(characterRows, 'character_reference_image', failedTaskRows),
    scenes: buildStatusCounts(sceneRows, 'scene_reference_image', failedTaskRows),
    storyboardFirstFrames: buildStatusCounts(storyboardRows, 'storyboard_first_frame', failedTaskRows),
  }
}

function buildStatusCounts(
  rows: Array<{ id: string; url: string | null }>,
  targetType: ImageTargetType,
  failedTaskRows: Array<{ targetType: string | null; targetId: string | null }>,
): ImageAssetStatusCounts {
  const total = rows.length
  const completed = rows.filter((row) => Boolean(row.url)).length
  const missing = total - completed

  const idsWithoutImage = new Set(rows.filter((row) => !row.url).map((row) => row.id))
  const failedTargetIds = new Set(
    failedTaskRows
      .filter((task) => task.targetType === targetType && task.targetId && idsWithoutImage.has(task.targetId))
      .map((task) => task.targetId as string),
  )

  return { total, completed, missing, failed: failedTargetIds.size }
}

export async function executeImageGeneration(
  deps: ImageGenerationServiceDeps,
  input: {
    taskId: string
    projectId: string
    targetType: ImageTargetType
    targetId: string
    prompt: string
    options?: StartImageGenerationRequest['options']
    force?: boolean
  },
) {
  const startedAt = new Date().toISOString()

  await deps.db
    .update(generationTasks)
    .set({
      status: 'running',
      startedAt,
      updatedAt: startedAt,
      errorMessage: null,
    })
    .where(eq(generationTasks.id, input.taskId))

  try {
    const providerRequest: ImageGenerationRequest = {
      prompt: input.prompt,
      negativePrompt: input.options?.negative_prompt,
      width: input.options?.width,
      height: input.options?.height,
      style: input.options?.style,
      metadata: {
        projectId: input.projectId,
        targetType: input.targetType,
        targetId: input.targetId,
        taskId: input.taskId,
      },
    }
    const providerResult = await deps.imageProvider.generateImage(providerRequest)
    const completedAt = new Date().toISOString()
    const assetId = nanoid()
    const output = {
      imageUrl: providerResult.imageUrl,
      provider: providerResult.provider,
      model: providerResult.model,
      assetId,
      raw: providerResult.raw,
    }

    await deps.db.transaction(async (tx) => {
      if (input.force === true) {
        await tx
          .update(assets)
          .set({ status: 'superseded', updatedAt: completedAt })
          .where(
            and(
              eq(assets.projectId, input.projectId),
              eq(assets.targetType, input.targetType),
              eq(assets.targetId, input.targetId),
              eq(assets.status, 'active'),
            ),
          )
      }

      await tx.insert(assets).values({
        id: assetId,
        projectId: input.projectId,
        assetType: input.targetType,
        targetType: input.targetType,
        targetId: input.targetId,
        generationTaskId: input.taskId,
        url: providerResult.imageUrl,
        provider: providerResult.provider,
        model: providerResult.model,
        prompt: input.prompt,
        metadataJson: JSON.stringify({ request: providerRequest }),
        status: 'active',
        createdAt: completedAt,
        updatedAt: completedAt,
      })

      await updateTargetImageUrl(tx, input.targetType, input.targetId, providerResult.imageUrl, completedAt)

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
        .where(eq(generationTasks.id, input.taskId))
    })

    return { success: true as const, taskId: input.taskId, assetId, imageUrl: providerResult.imageUrl }
  } catch (error) {
    await markTaskFailed(deps.db, input.taskId, error)
    return {
      success: false as const,
      taskId: input.taskId,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function getGenerationTask(db: DatabaseClient, taskId: string) {
  const [task] = await db.select().from(generationTasks).where(eq(generationTasks.id, taskId)).limit(1)
  return task ?? null
}

export async function getProjectAssets(db: DatabaseClient, projectId: string) {
  const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).limit(1)

  if (!project) {
    return null
  }

  const rows = await db.select().from(assets).where(eq(assets.projectId, projectId))
  return { projectId, assets: rows }
}

async function resolveImageTarget(
  db: DatabaseClient,
  projectId: string,
  request: StartImageGenerationRequest,
): Promise<ResolvedImageTarget> {
  if (request.target_type === 'character_reference_image') {
    const [character] = await db
      .select()
      .from(characters)
      .where(and(eq(characters.id, request.target_id), eq(characters.projectId, projectId)))
      .limit(1)

    if (!character) {
      throw new ImageGenerationServiceError(`Character not found: ${request.target_id}`, 404)
    }

    const [project] = await db.select({ visualStyle: projects.visualStyle }).from(projects).where(eq(projects.id, projectId)).limit(1)

    return {
      projectId,
      targetType: request.target_type,
      targetId: character.id,
      prompt:
        request.prompt_override ??
        compactPrompt([
          character.name,
          character.role,
          character.appearance,
          character.personality,
          project?.visualStyle ? `Project visual style: ${project.visualStyle}` : null,
        ]),
      existingUrl: character.referenceImageUrl,
    }
  }

  if (request.target_type === 'scene_reference_image') {
    const [scene] = await db
      .select()
      .from(scenes)
      .where(and(eq(scenes.id, request.target_id), eq(scenes.projectId, projectId)))
      .limit(1)

    if (!scene) {
      throw new ImageGenerationServiceError(`Scene not found: ${request.target_id}`, 404)
    }

    const [project] = await db.select({ visualStyle: projects.visualStyle }).from(projects).where(eq(projects.id, projectId)).limit(1)

    return {
      projectId,
      targetType: request.target_type,
      targetId: scene.id,
      prompt:
        request.prompt_override ??
        compactPrompt([
          scene.visualPrompt,
          scene.name,
          scene.description,
          scene.locationType,
          scene.visualStyle,
          project?.visualStyle ? `Project visual style: ${project.visualStyle}` : null,
        ]),
      existingUrl: scene.referenceImageUrl,
    }
  }

  const [storyboard] = await db
    .select()
    .from(storyboards)
    .where(and(eq(storyboards.id, request.target_id), eq(storyboards.projectId, projectId)))
    .limit(1)

  if (!storyboard) {
    throw new ImageGenerationServiceError(`Storyboard not found: ${request.target_id}`, 404)
  }

  const prompt =
    request.prompt_override ?? (await composeStoryboardFirstFramePrompt(db, projectId, storyboard))

  return {
    projectId,
    targetType: request.target_type,
    targetId: storyboard.id,
    prompt,
    existingUrl: storyboard.firstFrameImageUrl,
    episodeId: storyboard.episodeId,
    storyboardId: storyboard.id,
  }
}

async function composeStoryboardFirstFramePrompt(
  db: DatabaseClient,
  projectId: string,
  storyboard: typeof storyboards.$inferSelect,
) {
  const parts: Array<string | null | undefined> = [
    storyboard.imagePrompt,
    storyboard.action ? `Action: ${storyboard.action}` : null,
    storyboard.emotion ? `Emotion: ${storyboard.emotion}` : null,
  ]

  const dialogueText = extractDialogueText(storyboard.dialogueJson)
  if (dialogueText) {
    parts.push(`Dialogue: ${dialogueText}`)
  }

  if (storyboard.sceneId) {
    const [scene] = await db
      .select()
      .from(scenes)
      .where(and(eq(scenes.id, storyboard.sceneId), eq(scenes.projectId, projectId)))
      .limit(1)

    if (scene) {
      parts.push(
        scene.name ? `Scene: ${scene.name}` : null,
        scene.description,
        scene.visualPrompt,
        scene.referenceImageUrl ? `Scene reference image: ${scene.referenceImageUrl}` : null,
      )
    }
  }

  const characterIds = parseIdArray(storyboard.characterIdsJson)
  if (characterIds.length > 0) {
    const characterRows = await db
      .select()
      .from(characters)
      .where(and(eq(characters.projectId, projectId), inArray(characters.id, characterIds)))

    for (const character of characterRows) {
      parts.push(
        `Character: ${character.name}`,
        character.appearance,
        character.referenceImageUrl ? `Character reference image: ${character.referenceImageUrl}` : null,
      )
    }
  }

  const propIds = parseIdArray(storyboard.propIdsJson)
  if (propIds.length > 0) {
    const propRows = await db
      .select()
      .from(props)
      .where(and(eq(props.projectId, projectId), inArray(props.id, propIds)))

    for (const prop of propRows) {
      parts.push(`Prop: ${prop.name}`, prop.description)
    }
  }

  return compactPrompt(parts)
}

function parseIdArray(value: string) {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

function extractDialogueText(value: string) {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    return ''
  }

  if (!Array.isArray(parsed)) {
    return ''
  }

  return parsed
    .map((entry) => {
      if (typeof entry === 'string') {
        return entry
      }

      if (entry && typeof entry === 'object') {
        const record = entry as Record<string, unknown>
        const speaker = typeof record.speaker === 'string' ? record.speaker : null
        const line =
          typeof record.line === 'string'
            ? record.line
            : typeof record.text === 'string'
              ? record.text
              : null

        if (speaker && line) {
          return `${speaker}: ${line}`
        }

        return line ?? ''
      }

      return ''
    })
    .filter((text): text is string => Boolean(text.trim()))
    .join(' / ')
}

function compactPrompt(parts: Array<string | null | undefined>) {
  const prompt = parts.filter((part): part is string => Boolean(part?.trim())).join('\n')

  if (!prompt) {
    throw new ImageGenerationServiceError('Image generation requires a prompt or target visual description', 400)
  }

  return prompt
}

async function updateTargetImageUrl(
  tx: Parameters<Parameters<DatabaseClient['transaction']>[0]>[0],
  targetType: ImageTargetType,
  targetId: string,
  imageUrl: string,
  updatedAt: string,
) {
  if (targetType === 'character_reference_image') {
    await tx.update(characters).set({ referenceImageUrl: imageUrl, updatedAt }).where(eq(characters.id, targetId))
    return
  }

  if (targetType === 'scene_reference_image') {
    await tx.update(scenes).set({ referenceImageUrl: imageUrl, updatedAt }).where(eq(scenes.id, targetId))
    return
  }

  await tx.update(storyboards).set({ firstFrameImageUrl: imageUrl, updatedAt }).where(eq(storyboards.id, targetId))
}

async function markTaskFailed(db: DatabaseClient, taskId: string, error: unknown) {
  const now = new Date().toISOString()

  await db
    .update(generationTasks)
    .set({
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : String(error),
      completedAt: now,
      updatedAt: now,
    })
    .where(eq(generationTasks.id, taskId))
}
