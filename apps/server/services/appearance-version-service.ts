import { and, eq, inArray } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { z } from 'zod/v4'
import type { CharacterAppearanceVersion, DatabaseClient } from '../../../packages/database/index.js'
import {
  assets,
  characterAppearanceVersions,
  characters,
  generationTasks,
  getAppearanceVersionEffectiveNo,
  listCharacterAppearanceVersions,
} from '../../../packages/database/index.js'

export const CreateAppearanceVersionRequestSchema = z.object({
  appearance: z.string().min(1),
  effectiveFromEpisodeNo: z.number().int().positive(),
  changeReason: z.string().min(1).optional(),
})

export const UpdateAppearanceVersionRequestSchema = z
  .object({
    appearance: z.string().min(1).optional(),
    changeReason: z.string().min(1).nullable().optional(),
    effectiveFromEpisodeNo: z.number().int().positive().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' })

export type CreateAppearanceVersionRequest = z.infer<typeof CreateAppearanceVersionRequestSchema>
export type UpdateAppearanceVersionRequest = z.infer<typeof UpdateAppearanceVersionRequestSchema>

export class AppearanceVersionServiceError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly errorCode?: string,
  ) {
    super(message)
  }
}

export interface SerializedAppearanceVersion extends CharacterAppearanceVersion {
  /** Live effective episode number: explicit for manual versions, joined from the source episode otherwise. */
  effectiveEpisodeNo: number
}

export async function listAppearanceVersions(db: DatabaseClient, characterId: string) {
  const [character] = await db.select().from(characters).where(eq(characters.id, characterId)).limit(1)

  if (!character) {
    throw new AppearanceVersionServiceError(`Character not found: ${characterId}`, 404)
  }

  const versions = await listCharacterAppearanceVersions(db, characterId)

  return {
    characterId,
    versions: versions.map(
      (entry): SerializedAppearanceVersion => ({ ...entry.version, effectiveEpisodeNo: entry.effectiveEpisodeNo }),
    ),
  }
}

export async function createAppearanceVersion(
  db: DatabaseClient,
  characterId: string,
  request: CreateAppearanceVersionRequest,
): Promise<SerializedAppearanceVersion> {
  const [character] = await db
    .select({ id: characters.id })
    .from(characters)
    .where(eq(characters.id, characterId))
    .limit(1)

  if (!character) {
    throw new AppearanceVersionServiceError(`Character not found: ${characterId}`, 404)
  }

  const now = new Date().toISOString()
  const version = {
    id: nanoid(),
    characterId,
    sourceEpisodeId: null,
    effectiveFromEpisodeNo: request.effectiveFromEpisodeNo,
    appearance: request.appearance.trim(),
    referenceImageUrl: null,
    changeReason: request.changeReason?.trim() ?? null,
    createdAt: now,
    updatedAt: now,
  }

  try {
    await db.insert(characterAppearanceVersions).values(version)
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new AppearanceVersionServiceError(
        `Character already has a version effective from episode ${request.effectiveFromEpisodeNo}`,
        409,
        'APPEARANCE_VERSION_EPISODE_CONFLICT',
      )
    }
    throw error
  }

  // A freshly created version is always manual, so its effective episode is exactly the
  // requested one — matches the effectiveEpisodeNo the list endpoint computes via COALESCE.
  return { ...version, effectiveEpisodeNo: version.effectiveFromEpisodeNo }
}

export async function updateAppearanceVersion(
  db: DatabaseClient,
  versionId: string,
  request: UpdateAppearanceVersionRequest,
): Promise<SerializedAppearanceVersion> {
  const [version] = await db
    .select()
    .from(characterAppearanceVersions)
    .where(eq(characterAppearanceVersions.id, versionId))
    .limit(1)

  if (!version) {
    throw new AppearanceVersionServiceError(`Appearance version not found: ${versionId}`, 404)
  }

  // Auto versions derive their effective episode from the source episode (XOR invariant);
  // moving them is a re-extraction concern, not an edit.
  if (request.effectiveFromEpisodeNo !== undefined && version.sourceEpisodeId !== null) {
    throw new AppearanceVersionServiceError(
      'Cannot set effectiveFromEpisodeNo on an auto-detected version',
      400,
      'APPEARANCE_VERSION_AUTO_EFFECTIVE_NO',
    )
  }

  const now = new Date().toISOString()
  const updates: Partial<CharacterAppearanceVersion> = { updatedAt: now }
  if (request.appearance !== undefined) {
    updates.appearance = request.appearance.trim()
  }
  if (request.changeReason !== undefined) {
    updates.changeReason = request.changeReason?.trim() ?? null
  }
  if (request.effectiveFromEpisodeNo !== undefined) {
    updates.effectiveFromEpisodeNo = request.effectiveFromEpisodeNo
  }

  try {
    await db.update(characterAppearanceVersions).set(updates).where(eq(characterAppearanceVersions.id, versionId))
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new AppearanceVersionServiceError(
        `Character already has a version effective from episode ${request.effectiveFromEpisodeNo}`,
        409,
        'APPEARANCE_VERSION_EPISODE_CONFLICT',
      )
    }
    throw error
  }

  // Auto versions derive their effective episode from the source episode; re-read it so the
  // response carries the same effectiveEpisodeNo the list endpoint would compute.
  const effectiveEpisodeNo = (await getAppearanceVersionEffectiveNo(db, versionId)) ?? 0
  return { ...version, ...updates, effectiveEpisodeNo }
}

export async function deleteAppearanceVersion(db: DatabaseClient, versionId: string): Promise<void> {
  const [version] = await db
    .select({ id: characterAppearanceVersions.id })
    .from(characterAppearanceVersions)
    .where(eq(characterAppearanceVersions.id, versionId))
    .limit(1)

  if (!version) {
    throw new AppearanceVersionServiceError(`Appearance version not found: ${versionId}`, 404)
  }

  const [inFlightTask] = await db
    .select({ id: generationTasks.id })
    .from(generationTasks)
    .where(
      and(
        eq(generationTasks.taskType, 'image_generation'),
        eq(generationTasks.targetType, 'character_appearance_version'),
        eq(generationTasks.targetId, versionId),
        inArray(generationTasks.status, ['pending', 'running']),
      ),
    )
    .limit(1)

  if (inFlightTask) {
    throw new AppearanceVersionServiceError(
      `Appearance version has an image generation task in flight: ${versionId}`,
      409,
      'APPEARANCE_VERSION_TASK_IN_FLIGHT',
    )
  }

  const now = new Date().toISOString()
  await db.transaction(async (tx) => {
    await tx
      .update(assets)
      .set({ status: 'superseded', updatedAt: now })
      .where(
        and(
          eq(assets.targetType, 'character_appearance_version'),
          eq(assets.targetId, versionId),
          eq(assets.status, 'active'),
        ),
      )
    await tx.delete(characterAppearanceVersions).where(eq(characterAppearanceVersions.id, versionId))
  })
}

function isUniqueConstraintError(error: unknown): boolean {
  // Drizzle wraps the libSQL error in a DrizzleQueryError; walk the cause chain.
  for (let current = error; current instanceof Error; current = current.cause as Error | undefined) {
    if (current.message.includes('UNIQUE constraint failed') || current.message.includes('SQLITE_CONSTRAINT')) {
      return true
    }
  }
  return false
}
