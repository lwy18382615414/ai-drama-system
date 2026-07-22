import { and, eq, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { Character, DatabaseClient, Prop, Scene } from '../../database/index.js'
import {
  agentRuns,
  assets,
  characterAppearanceVersions,
  characters,
  episodeCharacterLinks,
  episodePropLinks,
  episodePipelineStates,
  episodeSceneLinks,
  episodes,
  generationTasks,
  props,
  scenes,
} from '../../database/index.js'
import type { StructuredTextProvider } from '../../providers/index.js'
import { buildExtractAgentContext } from './context.js'
import { buildExtractAgentSystemPrompt, buildExtractAgentUserPrompt } from './prompt.js'
import {
  ExtractAgentInputSchema,
  ExtractAgentOutputSchema,
  type ExtractAgentInput,
  type ExtractAgentOutput,
  type ExtractAgentResult,
  type ExtractedCharacter,
  type ExtractedProp,
  type ExtractedScene,
} from './schema.js'

export interface RunExtractAgentParams {
  db: DatabaseClient
  provider: StructuredTextProvider
  input: ExtractAgentInput
}

const AGENT_TYPE = 'ExtractAgent'
const SKILL_NAME = 'asset-extraction'
const SKILL_VERSION = '1.0.0'
const TASK_TYPE = 'asset_extraction'

export async function runExtractAgent(params: RunExtractAgentParams): Promise<ExtractAgentResult> {
  const input = ExtractAgentInputSchema.parse(params.input)
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

    const context = await buildExtractAgentContext(params.db, input)

    if (input.options?.force !== true && await hasEpisodeAssetLinks(params.db, input.episodeId)) {
      throw new Error(`Episode already has extracted assets: ${input.episodeId}`)
    }

    const providerResult = await params.provider.generateStructuredJson({
      systemPrompt: buildExtractAgentSystemPrompt(),
      userPrompt: buildExtractAgentUserPrompt(context, input),
      schemaName: 'ExtractAgentOutput',
      schema: ExtractAgentOutputSchema,
      metadata: {
        projectId: input.projectId,
        episodeId: input.episodeId,
        scriptId: context.script.id,
        agentRunId,
        taskId,
      },
    })

    const output = ExtractAgentOutputSchema.parse(providerResult.data)
    validateExtractAgentOutput(output)

    const completedAt = new Date().toISOString()
    const outputJson = JSON.stringify(output)
    const characterIds: string[] = []
    const sceneIds: string[] = []
    const propIds: string[] = []
    const appearanceVersions: Array<{
      versionId: string
      characterId: string
      action: 'created' | 'updated' | 'unchanged'
    }> = []

    await params.db.transaction(async (tx) => {
      if (input.options?.force === true) {
        await tx.delete(episodeCharacterLinks).where(eq(episodeCharacterLinks.episodeId, input.episodeId))
        await tx.delete(episodeSceneLinks).where(eq(episodeSceneLinks.episodeId, input.episodeId))
        await tx.delete(episodePropLinks).where(eq(episodePropLinks.episodeId, input.episodeId))
      }

      const characterByName = new Map(context.existingCharacters.map((character) => [normalizeAssetKey(character.name), character]))
      const sceneByName = new Map(context.existingScenes.map((scene) => [normalizeAssetKey(scene.name), scene]))
      const propByName = new Map(context.existingProps.map((prop) => [normalizeAssetKey(prop.name), prop]))

      for (const extracted of output.characters) {
        const name = normalizeDisplayName(extracted.name)
        const key = normalizeAssetKey(name)
        const existing = characterByName.get(key)
        let characterId = existing?.id ?? nanoid()

        if (existing) {
          const updates = buildCharacterFillUpdates(existing, extracted, completedAt)

          if (Object.keys(updates).length > 0) {
            await tx.update(characters).set(updates).where(eq(characters.id, existing.id))
          }

          // Appearance changes only apply to pre-existing characters; a new character's
          // appearance field already is its base look.
          const version = await upsertAppearanceVersion(
            tx,
            input.episodeId,
            existing.id,
            extracted.appearance_change,
            completedAt,
          )
          if (version) {
            appearanceVersions.push({ ...version, characterId: existing.id })
          }
        } else {
          await tx.insert(characters).values({
            id: characterId,
            projectId: input.projectId,
            name,
            aliasJson: JSON.stringify(extracted.alias_json),
            role: cleanText(extracted.role),
            age: cleanText(extracted.age),
            gender: cleanText(extracted.gender),
            appearance: cleanText(extracted.appearance),
            personality: cleanText(extracted.personality),
            background: cleanText(extracted.background),
            relationshipJson: JSON.stringify(extracted.relationship_json),
            referenceImageUrl: cleanText(extracted.reference_image_url),
            voiceId: cleanText(extracted.voice_id),
            status: 'active',
            createdAt: completedAt,
            updatedAt: completedAt,
          })
          characterByName.set(key, {
            id: characterId,
            projectId: input.projectId,
            name,
            aliasJson: extracted.alias_json,
            role: cleanText(extracted.role),
            age: cleanText(extracted.age),
            gender: cleanText(extracted.gender),
            appearance: cleanText(extracted.appearance),
            personality: cleanText(extracted.personality),
            background: cleanText(extracted.background),
            relationshipJson: extracted.relationship_json,
            referenceImageUrl: cleanText(extracted.reference_image_url),
            voiceId: cleanText(extracted.voice_id),
            status: 'active',
          })
        }

        characterIds.push(characterId)
        await tx.insert(episodeCharacterLinks).values({
          id: nanoid(),
          projectId: input.projectId,
          episodeId: input.episodeId,
          characterId,
          usageType: cleanText(extracted.usage_type) ?? 'mentioned',
          createdAt: completedAt,
          updatedAt: completedAt,
        })
      }

      for (const extracted of output.scenes) {
        const name = normalizeDisplayName(extracted.name)
        const key = normalizeAssetKey(name)
        const existing = sceneByName.get(key)
        let sceneId = existing?.id ?? nanoid()

        if (existing) {
          const updates = buildSceneFillUpdates(existing, extracted, completedAt)

          if (Object.keys(updates).length > 0) {
            await tx.update(scenes).set(updates).where(eq(scenes.id, existing.id))
          }
        } else {
          await tx.insert(scenes).values({
            id: sceneId,
            projectId: input.projectId,
            name,
            description: cleanText(extracted.description),
            locationType: cleanText(extracted.location_type),
            visualStyle: cleanText(extracted.visual_style),
            visualPrompt: cleanText(extracted.visual_prompt),
            referenceImageUrl: cleanText(extracted.reference_image_url),
            status: 'active',
            createdAt: completedAt,
            updatedAt: completedAt,
          })
          sceneByName.set(key, {
            id: sceneId,
            projectId: input.projectId,
            name,
            description: cleanText(extracted.description),
            locationType: cleanText(extracted.location_type),
            visualStyle: cleanText(extracted.visual_style),
            visualPrompt: cleanText(extracted.visual_prompt),
            referenceImageUrl: cleanText(extracted.reference_image_url),
            status: 'active',
          })
        }

        sceneIds.push(sceneId)
        await tx.insert(episodeSceneLinks).values({
          id: nanoid(),
          projectId: input.projectId,
          episodeId: input.episodeId,
          sceneId,
          usageType: cleanText(extracted.usage_type) ?? 'used',
          createdAt: completedAt,
          updatedAt: completedAt,
        })
      }

      for (const extracted of output.props) {
        const name = normalizeDisplayName(extracted.name)
        const key = normalizeAssetKey(name)
        const existing = propByName.get(key)
        let propId = existing?.id ?? nanoid()

        if (existing) {
          const updates = buildPropFillUpdates(existing, extracted, completedAt)

          if (Object.keys(updates).length > 0) {
            await tx.update(props).set(updates).where(eq(props.id, existing.id))
          }
        } else {
          await tx.insert(props).values({
            id: propId,
            projectId: input.projectId,
            name,
            description: cleanText(extracted.description),
            significance: cleanText(extracted.significance),
            visualPrompt: cleanText(extracted.visual_prompt),
            referenceImageUrl: cleanText(extracted.reference_image_url),
            status: 'active',
            createdAt: completedAt,
            updatedAt: completedAt,
          })
          propByName.set(key, {
            id: propId,
            projectId: input.projectId,
            name,
            description: cleanText(extracted.description),
            significance: cleanText(extracted.significance),
            visualPrompt: cleanText(extracted.visual_prompt),
            referenceImageUrl: cleanText(extracted.reference_image_url),
            status: 'active',
          })
        }

        propIds.push(propId)
        await tx.insert(episodePropLinks).values({
          id: nanoid(),
          projectId: input.projectId,
          episodeId: input.episodeId,
          propId,
          usageType: cleanText(extracted.usage_type) ?? 'used',
          createdAt: completedAt,
          updatedAt: completedAt,
        })
      }

      // Versions previously sourced from this episode whose character no longer appears
      // in the latest extraction are stale — drop them (and retire their images).
      const staleVersions = await tx
        .select({ id: characterAppearanceVersions.id, characterId: characterAppearanceVersions.characterId })
        .from(characterAppearanceVersions)
        .where(eq(characterAppearanceVersions.sourceEpisodeId, input.episodeId))
      const extractedCharacterIds = new Set(characterIds)
      for (const stale of staleVersions) {
        if (!extractedCharacterIds.has(stale.characterId)) {
          await supersedeVersionAssets(tx, stale.id, completedAt)
          await tx.delete(characterAppearanceVersions).where(eq(characterAppearanceVersions.id, stale.id))
        }
      }

      await tx
        .update(episodes)
        .set({
          status: 'assets_ready',
          updatedAt: completedAt,
        })
        .where(eq(episodes.id, input.episodeId))

      await tx.insert(episodePipelineStates).values({ episodeId: input.episodeId, updatedAt: completedAt }).onConflictDoNothing()
      await tx
        .update(episodePipelineStates)
        .set({
          assetRevision: sql`${episodePipelineStates.assetRevision} + 1`,
          assetsStale: false,
          storyboardsStale: true,
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
      data: output,
      assetIds: {
        characterIds,
        sceneIds,
        propIds,
      },
      appearanceVersions,
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

export function validateExtractAgentOutput(output: ExtractAgentOutput) {
  assertUniqueNames('characters', output.characters.map((character) => character.name))
  assertUniqueNames('scenes', output.scenes.map((scene) => scene.name))
  assertUniqueNames('props', output.props.map((prop) => prop.name))
}

export function normalizeDisplayName(name: string) {
  return name.trim().replace(/\s+/g, ' ')
}

export function normalizeAssetKey(name: string) {
  return normalizeDisplayName(name).toLocaleLowerCase()
}

type Tx = Parameters<Parameters<DatabaseClient['transaction']>[0]>[0]

/**
 * Aligns the appearance version keyed by (character, source episode) with the latest
 * extraction: create when a change appears, refresh when its text moved (retiring the now
 * stale image), delete when a force re-extraction no longer reports a change.
 */
async function upsertAppearanceVersion(
  tx: Tx,
  episodeId: string,
  characterId: string,
  change: { new_appearance: string; reason?: string | null } | null | undefined,
  now: string,
): Promise<{ versionId: string; action: 'created' | 'updated' | 'unchanged' } | null> {
  const [existingVersion] = await tx
    .select()
    .from(characterAppearanceVersions)
    .where(
      and(
        eq(characterAppearanceVersions.characterId, characterId),
        eq(characterAppearanceVersions.sourceEpisodeId, episodeId),
      ),
    )
    .limit(1)

  const newAppearance = cleanText(change?.new_appearance)

  if (!newAppearance) {
    if (existingVersion) {
      await supersedeVersionAssets(tx, existingVersion.id, now)
      await tx.delete(characterAppearanceVersions).where(eq(characterAppearanceVersions.id, existingVersion.id))
    }
    return null
  }

  const changeReason = cleanText(change?.reason)

  if (!existingVersion) {
    const versionId = nanoid()
    await tx.insert(characterAppearanceVersions).values({
      id: versionId,
      characterId,
      sourceEpisodeId: episodeId,
      effectiveFromEpisodeNo: null,
      appearance: newAppearance,
      referenceImageUrl: null,
      changeReason,
      createdAt: now,
      updatedAt: now,
    })
    return { versionId, action: 'created' }
  }

  if (existingVersion.appearance !== newAppearance) {
    await supersedeVersionAssets(tx, existingVersion.id, now)
    await tx
      .update(characterAppearanceVersions)
      .set({
        appearance: newAppearance,
        changeReason,
        referenceImageUrl: null,
        updatedAt: now,
      })
      .where(eq(characterAppearanceVersions.id, existingVersion.id))
    return { versionId: existingVersion.id, action: 'updated' }
  }

  return { versionId: existingVersion.id, action: 'unchanged' }
}

async function supersedeVersionAssets(tx: Tx, versionId: string, now: string) {
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

function assertUniqueNames(label: string, names: string[]) {
  const seen = new Set<string>()

  for (const name of names) {
    const key = normalizeAssetKey(name)

    if (!key) {
      throw new Error(`ExtractAgent output ${label} contains an empty name`)
    }

    if (seen.has(key)) {
      throw new Error(`ExtractAgent output ${label} contains duplicate name: ${name}`)
    }

    seen.add(key)
  }
}

function buildCharacterFillUpdates(
  existing: {
    aliasJson: unknown[]
    role?: string | null
    age?: string | null
    gender?: string | null
    appearance?: string | null
    personality?: string | null
    background?: string | null
    relationshipJson: unknown[]
    referenceImageUrl?: string | null
    voiceId?: string | null
  },
  extracted: ExtractedCharacter,
  updatedAt: string,
): Partial<Character> {
  const updates: Partial<Character> = {}

  if (existing.aliasJson.length === 0 && extracted.alias_json.length > 0) {
    updates.aliasJson = JSON.stringify(extracted.alias_json)
  }

  maybeFillText(updates, 'role', existing.role, extracted.role)
  maybeFillText(updates, 'age', existing.age, extracted.age)
  maybeFillText(updates, 'gender', existing.gender, extracted.gender)
  maybeFillText(updates, 'appearance', existing.appearance, extracted.appearance)
  maybeFillText(updates, 'personality', existing.personality, extracted.personality)
  maybeFillText(updates, 'background', existing.background, extracted.background)

  if (existing.relationshipJson.length === 0 && extracted.relationship_json.length > 0) {
    updates.relationshipJson = JSON.stringify(extracted.relationship_json)
  }

  maybeFillText(updates, 'referenceImageUrl', existing.referenceImageUrl, extracted.reference_image_url)
  maybeFillText(updates, 'voiceId', existing.voiceId, extracted.voice_id)

  if (Object.keys(updates).length > 0) {
    updates.updatedAt = updatedAt
  }

  return updates
}

function buildSceneFillUpdates(
  existing: {
    description?: string | null
    locationType?: string | null
    visualStyle?: string | null
    visualPrompt?: string | null
    referenceImageUrl?: string | null
  },
  extracted: ExtractedScene,
  updatedAt: string,
): Partial<Scene> {
  const updates: Partial<Scene> = {}

  maybeFillText(updates, 'description', existing.description, extracted.description)
  maybeFillText(updates, 'locationType', existing.locationType, extracted.location_type)
  maybeFillText(updates, 'visualStyle', existing.visualStyle, extracted.visual_style)
  maybeFillText(updates, 'visualPrompt', existing.visualPrompt, extracted.visual_prompt)
  maybeFillText(updates, 'referenceImageUrl', existing.referenceImageUrl, extracted.reference_image_url)

  if (Object.keys(updates).length > 0) {
    updates.updatedAt = updatedAt
  }

  return updates
}

function buildPropFillUpdates(
  existing: {
    description?: string | null
    significance?: string | null
    visualPrompt?: string | null
    referenceImageUrl?: string | null
  },
  extracted: ExtractedProp,
  updatedAt: string,
): Partial<Prop> {
  const updates: Partial<Prop> = {}

  maybeFillText(updates, 'description', existing.description, extracted.description)
  maybeFillText(updates, 'significance', existing.significance, extracted.significance)
  maybeFillText(updates, 'visualPrompt', existing.visualPrompt, extracted.visual_prompt)
  maybeFillText(updates, 'referenceImageUrl', existing.referenceImageUrl, extracted.reference_image_url)

  if (Object.keys(updates).length > 0) {
    updates.updatedAt = updatedAt
  }

  return updates
}

function maybeFillText<T extends Record<string, unknown>>(
  updates: T,
  key: keyof T,
  existingValue: string | null | undefined,
  nextValue: string | null | undefined,
) {
  const cleaned = cleanText(nextValue)

  if (isEmptyText(existingValue) && cleaned) {
    updates[key] = cleaned as T[keyof T]
  }
}

function cleanText(value: string | null | undefined) {
  const cleaned = value?.trim()
  return cleaned ? cleaned : null
}

function isEmptyText(value: string | null | undefined) {
  return !value || value.trim().length === 0
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
