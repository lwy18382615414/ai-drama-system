import { and, eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import type { DatabaseClient } from '../../../packages/database/index.js'
import {
  assets,
  characters,
  generationTasks,
  projects,
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

export type ImageTargetType = z.infer<typeof ImageTargetTypeSchema>
export type StartImageGenerationRequest = z.infer<typeof StartImageGenerationRequestSchema>
export type StartCharacterReferenceImageRequest = z.infer<typeof StartCharacterReferenceImageRequestSchema>
export type StartSceneReferenceImageRequest = z.infer<typeof StartSceneReferenceImageRequestSchema>

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

  const now = new Date().toISOString()
  const taskId = nanoid()
  const input = {
    projectId,
    targetType: target.targetType,
    targetId: target.targetId,
    prompt: target.prompt,
    options: request.options ?? {},
    force: request.force ?? false,
    taskId,
  }

  await deps.db.insert(generationTasks).values({
    id: taskId,
    projectId,
    episodeId: target.episodeId ?? null,
    storyboardId: target.storyboardId ?? null,
    targetType: target.targetType,
    targetId: target.targetId,
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

  return {
    projectId,
    targetType: request.target_type,
    targetId: storyboard.id,
    prompt: request.prompt_override ?? storyboard.imagePrompt,
    existingUrl: storyboard.firstFrameImageUrl,
    episodeId: storyboard.episodeId,
    storyboardId: storyboard.id,
  }
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
