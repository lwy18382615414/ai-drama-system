import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { z } from 'zod/v4'
import {
  StoryboardAgentOptionsSchema,
  runStoryboardAgent,
  StoryboardDialogueSchema,
  type StoryboardAgentInput,
} from '../../../packages/agents/storyboard-agent/index.js'
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
  storyboards,
} from '../../../packages/database/index.js'
import { ScriptAgentOutputSchema } from '../../../packages/agents/script-agent/index.js'
import type { StructuredTextProvider } from '../../../packages/providers/index.js'

export const StartStoryboardGenerationRequestSchema = z.object({
  force: z.boolean().optional(),
  options: StoryboardAgentOptionsSchema.omit({ force: true }).optional(),
})

export const PatchStoryboardRequestSchema = z.object({
  shot_no: z.number().int().positive().optional(),
  duration: z.number().int().positive().optional(),
  scene_id: z.string().min(1).nullable().optional(),
  character_ids: z.array(z.string().min(1)).optional(),
  prop_ids: z.array(z.string().min(1)).optional(),
  script_section_no: z.number().int().positive().nullable().optional(),
  shot_type: z.string().min(1).optional(),
  camera_angle: z.string().nullable().optional(),
  camera_movement: z.string().nullable().optional(),
  action: z.string().min(1).optional(),
  dialogue: z.array(StoryboardDialogueSchema).optional(),
  narration: z.string().nullable().optional(),
  emotion: z.string().nullable().optional(),
  image_prompt: z.string().min(1).optional(),
  video_prompt: z.string().min(1).optional(),
  first_frame_image_url: z.string().nullable().optional(),
  last_frame_image_url: z.string().nullable().optional(),
  video_url: z.string().nullable().optional(),
  tts_audio_url: z.string().nullable().optional(),
  subtitle_url: z.string().nullable().optional(),
  composed_video_url: z.string().nullable().optional(),
  status: z.string().min(1).optional(),
})

export type StartStoryboardGenerationRequest = z.infer<typeof StartStoryboardGenerationRequestSchema>
export type PatchStoryboardRequest = z.infer<typeof PatchStoryboardRequestSchema>

export class StoryboardServiceError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message)
  }
}

export interface StoryboardServiceDeps {
  db: DatabaseClient
  provider: StructuredTextProvider
}

export async function startStoryboardGeneration(
  deps: StoryboardServiceDeps,
  episodeId: string,
  request: StartStoryboardGenerationRequest,
) {
  const now = new Date().toISOString()
  const input = await buildStoryboardAgentInput(deps.db, episodeId, request)
  const taskId = nanoid()

  await deps.db.insert(generationTasks).values({
    id: taskId,
    projectId: input.projectId,
    episodeId,
    storyboardId: null,
    taskType: 'storyboard_generation',
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

  setTimeout(() => {
    void runStoryboardAgent({
      db: deps.db,
      provider: deps.provider,
      input: {
        ...input,
        taskId,
      },
    })
  }, 0)

  return { taskId, status: 'pending' as const }
}

export async function getEpisodeStoryboards(db: DatabaseClient, episodeId: string) {
  const [episode] = await db.select().from(episodes).where(eq(episodes.id, episodeId)).limit(1)

  if (!episode) {
    return null
  }

  const rows = await db
    .select()
    .from(storyboards)
    .where(eq(storyboards.episodeId, episodeId))
    .orderBy(storyboards.shotNo)

  return { episode, storyboards: rows.map(serializeStoryboard) }
}

export async function getStoryboard(db: DatabaseClient, storyboardId: string) {
  const [storyboard] = await db.select().from(storyboards).where(eq(storyboards.id, storyboardId)).limit(1)

  if (!storyboard) {
    return null
  }

  return serializeStoryboard(storyboard)
}

export async function updateStoryboard(db: DatabaseClient, storyboardId: string, request: PatchStoryboardRequest) {
  const [existing] = await db.select().from(storyboards).where(eq(storyboards.id, storyboardId)).limit(1)

  if (!existing) {
    throw new StoryboardServiceError(`Storyboard not found: ${storyboardId}`, 404)
  }

  if (request.scene_id !== undefined && request.scene_id !== null) {
    await assertEpisodeScene(db, existing.episodeId, request.scene_id)
  }

  if (request.character_ids !== undefined) {
    await assertEpisodeCharacters(db, existing.episodeId, request.character_ids)
  }

  if (request.prop_ids !== undefined) {
    await assertEpisodeProps(db, existing.episodeId, request.prop_ids)
  }

  const now = new Date().toISOString()
  const updates: {
    shotNo?: number
    duration?: number
    sceneId?: string | null
    characterIdsJson?: string
    propIdsJson?: string
    scriptSectionNo?: number | null
    shotType?: string
    cameraAngle?: string | null
    cameraMovement?: string | null
    action?: string
    dialogueJson?: string
    narration?: string | null
    emotion?: string | null
    imagePrompt?: string
    videoPrompt?: string
    firstFrameImageUrl?: string | null
    lastFrameImageUrl?: string | null
    videoUrl?: string | null
    ttsAudioUrl?: string | null
    subtitleUrl?: string | null
    composedVideoUrl?: string | null
    status?: string
    updatedAt: string
  } = { updatedAt: now }

  if (request.shot_no !== undefined) updates.shotNo = request.shot_no
  if (request.duration !== undefined) updates.duration = request.duration
  if (request.scene_id !== undefined) updates.sceneId = request.scene_id
  if (request.character_ids !== undefined) updates.characterIdsJson = JSON.stringify(request.character_ids)
  if (request.prop_ids !== undefined) updates.propIdsJson = JSON.stringify(request.prop_ids)
  if (request.script_section_no !== undefined) updates.scriptSectionNo = request.script_section_no
  if (request.shot_type !== undefined) updates.shotType = request.shot_type
  if (request.camera_angle !== undefined) updates.cameraAngle = request.camera_angle
  if (request.camera_movement !== undefined) updates.cameraMovement = request.camera_movement
  if (request.action !== undefined) updates.action = request.action
  if (request.dialogue !== undefined) updates.dialogueJson = JSON.stringify(request.dialogue)
  if (request.narration !== undefined) updates.narration = request.narration
  if (request.emotion !== undefined) updates.emotion = request.emotion
  if (request.image_prompt !== undefined) updates.imagePrompt = request.image_prompt
  if (request.video_prompt !== undefined) updates.videoPrompt = request.video_prompt
  if (request.first_frame_image_url !== undefined) updates.firstFrameImageUrl = request.first_frame_image_url
  if (request.last_frame_image_url !== undefined) updates.lastFrameImageUrl = request.last_frame_image_url
  if (request.video_url !== undefined) updates.videoUrl = request.video_url
  if (request.tts_audio_url !== undefined) updates.ttsAudioUrl = request.tts_audio_url
  if (request.subtitle_url !== undefined) updates.subtitleUrl = request.subtitle_url
  if (request.composed_video_url !== undefined) updates.composedVideoUrl = request.composed_video_url
  if (request.status !== undefined) updates.status = request.status

  if (Object.keys(updates).length === 1) {
    throw new StoryboardServiceError('Storyboard update requires at least one field', 400)
  }

  await db.update(storyboards).set(updates).where(eq(storyboards.id, storyboardId))

  const [storyboard] = await db.select().from(storyboards).where(eq(storyboards.id, storyboardId)).limit(1)
  return serializeStoryboard(storyboard)
}

async function buildStoryboardAgentInput(
  db: DatabaseClient,
  episodeId: string,
  request: StartStoryboardGenerationRequest,
): Promise<StoryboardAgentInput> {
  const [episode] = await db.select().from(episodes).where(eq(episodes.id, episodeId)).limit(1)

  if (!episode) {
    throw new StoryboardServiceError(`Episode not found: ${episodeId}`, 404)
  }

  const [project] = await db.select().from(projects).where(eq(projects.id, episode.projectId)).limit(1)

  if (!project) {
    throw new StoryboardServiceError(`Project not found: ${episode.projectId}`, 404)
  }

  const [script] = await db.select().from(scripts).where(eq(scripts.episodeId, episodeId)).limit(1)

  if (!script) {
    throw new StoryboardServiceError(`Script not found for episode: ${episodeId}`, 404)
  }

  const [existingStoryboard] = await db
    .select({ id: storyboards.id })
    .from(storyboards)
    .where(eq(storyboards.episodeId, episodeId))
    .limit(1)

  if (existingStoryboard && request.force !== true) {
    throw new StoryboardServiceError(`Episode already has storyboards: ${episodeId}`, 409)
  }

  const characterRows = await db
    .select({ character: characters })
    .from(episodeCharacterLinks)
    .innerJoin(characters, eq(episodeCharacterLinks.characterId, characters.id))
    .where(eq(episodeCharacterLinks.episodeId, episodeId))
    .orderBy(characters.name)

  const sceneRows = await db
    .select({ scene: scenes })
    .from(episodeSceneLinks)
    .innerJoin(scenes, eq(episodeSceneLinks.sceneId, scenes.id))
    .where(eq(episodeSceneLinks.episodeId, episodeId))
    .orderBy(scenes.name)

  const propRows = await db
    .select({ prop: props })
    .from(episodePropLinks)
    .innerJoin(props, eq(episodePropLinks.propId, props.id))
    .where(eq(episodePropLinks.episodeId, episodeId))
    .orderBy(props.name)

  if (sceneRows.length === 0) {
    throw new StoryboardServiceError(`Episode has no linked scenes: ${episodeId}`, 400)
  }

  const scriptStructuredJson = ScriptAgentOutputSchema.parse(JSON.parse(script.structuredJson))

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
    characters: characterRows.map(({ character }) => ({
      id: character.id,
      projectId: character.projectId,
      name: character.name,
      role: character.role,
      appearance: character.appearance,
      status: character.status,
    })),
    scenes: sceneRows.map(({ scene }) => ({
      id: scene.id,
      projectId: scene.projectId,
      name: scene.name,
      description: scene.description,
      locationType: scene.locationType,
      visualStyle: scene.visualStyle,
      visualPrompt: scene.visualPrompt,
      status: scene.status,
    })),
    props: propRows.map(({ prop }) => ({
      id: prop.id,
      projectId: prop.projectId,
      name: prop.name,
      description: prop.description,
      significance: prop.significance,
      visualPrompt: prop.visualPrompt,
      status: prop.status,
    })),
    projectStyle: {
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

async function assertEpisodeScene(db: DatabaseClient, episodeId: string, sceneId: string) {
  const [row] = await db
    .select({ id: episodeSceneLinks.id })
    .from(episodeSceneLinks)
    .where(eq(episodeSceneLinks.episodeId, episodeId))
    .limit(1)

  if (!row || !(await hasEpisodeScene(db, episodeId, sceneId))) {
    throw new StoryboardServiceError(`Scene is not linked to episode: ${sceneId}`, 400)
  }
}

async function hasEpisodeScene(db: DatabaseClient, episodeId: string, sceneId: string) {
  const rows = await db.select().from(episodeSceneLinks).where(eq(episodeSceneLinks.episodeId, episodeId))
  return rows.some((row) => row.sceneId === sceneId)
}

async function assertEpisodeCharacters(db: DatabaseClient, episodeId: string, characterIds: string[]) {
  const rows = await db.select().from(episodeCharacterLinks).where(eq(episodeCharacterLinks.episodeId, episodeId))
  const validIds = new Set(rows.map((row) => row.characterId))
  assertKnownIds('character', characterIds, validIds)
}

async function assertEpisodeProps(db: DatabaseClient, episodeId: string, propIds: string[]) {
  const rows = await db.select().from(episodePropLinks).where(eq(episodePropLinks.episodeId, episodeId))
  const validIds = new Set(rows.map((row) => row.propId))
  assertKnownIds('prop', propIds, validIds)
}

function assertKnownIds(label: string, ids: string[], validIds: Set<string>) {
  const seen = new Set<string>()

  for (const id of ids) {
    if (seen.has(id)) {
      throw new StoryboardServiceError(`Duplicate ${label}_id: ${id}`, 400)
    }

    seen.add(id)

    if (!validIds.has(id)) {
      throw new StoryboardServiceError(`${label}_id is not linked to episode: ${id}`, 400)
    }
  }
}

function serializeStoryboard(storyboard: typeof storyboards.$inferSelect) {
  return {
    ...storyboard,
    characterIds: parseStringArray(storyboard.characterIdsJson),
    propIds: parseStringArray(storyboard.propIdsJson),
    dialogue: parseUnknownArray(storyboard.dialogueJson),
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
