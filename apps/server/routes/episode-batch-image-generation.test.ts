import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import {
  assets,
  characters,
  createDatabase,
  episodeCharacterLinks,
  episodeSceneLinks,
  episodes,
  generationTasks,
  initializeDatabase,
  projects,
  props,
  scenes,
  storyboards,
  type DatabaseClient,
} from '../../../packages/database/index.js'
import { MockImageProvider, type ImageGenerationRequest } from '../../../packages/providers/index.js'
import { createImageGenerationRoutes } from './image-generation.js'

interface BatchResultBody {
  episodeId: string
  targetType: string
  summary: { total: number; completed: number; skipped: number; failed: number }
  results: Array<{ targetId: string; status: string; taskId?: string; imageUrl?: string }>
}

interface ApiResponse<T> {
  code: number
  message: string
  data: T
}

async function createTestApp(
  responseFactory?: (request: ImageGenerationRequest) => string,
) {
  const db = await createDatabase(':memory:')
  await initializeDatabase(db)

  const now = new Date().toISOString()
  await db.insert(projects).values({
    id: 'project-1',
    title: 'Batch image test project',
    description: null,
    genre: 'drama',
    targetPlatform: 'short_video',
    visualStyle: 'realistic',
    episodeDuration: 60,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  })
  await db.insert(episodes).values({
    id: 'episode-1',
    projectId: 'project-1',
    episodeNo: 1,
    title: 'Episode 1',
    summary: null,
    openingHook: null,
    endingHook: null,
    scriptId: null,
    videoUrl: null,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  })
  await db.insert(scenes).values({
    id: 'scene-1',
    projectId: 'project-1',
    name: '宴会厅',
    description: 'luxury banquet hall',
    locationType: 'interior',
    visualStyle: 'realistic',
    visualPrompt: 'realistic luxury banquet hall, dramatic lighting',
    referenceImageUrl: null,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  })
  await db.insert(characters).values([
    {
      id: 'character-1',
      projectId: 'project-1',
      name: '林薇',
      aliasJson: '[]',
      role: 'protagonist',
      age: '28',
      gender: 'female',
      appearance: 'elegant woman in a red gown',
      personality: 'determined',
      background: null,
      relationshipJson: '[]',
      referenceImageUrl: null,
      voiceId: null,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'character-2',
      projectId: 'project-1',
      name: '顾沉',
      aliasJson: '[]',
      role: 'antagonist',
      age: '35',
      gender: 'male',
      appearance: 'man in a dark suit',
      personality: 'cold',
      background: null,
      relationshipJson: '[]',
      referenceImageUrl: null,
      voiceId: null,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    },
  ])
  await db.insert(props).values({
    id: 'prop-1',
    projectId: 'project-1',
    name: '钻石项链',
    description: 'sparkling diamond necklace',
    significance: 'plot device',
    visualPrompt: null,
    referenceImageUrl: null,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  })
  await db.insert(episodeCharacterLinks).values([
    {
      id: 'ecl-1',
      projectId: 'project-1',
      episodeId: 'episode-1',
      characterId: 'character-1',
      usageType: 'appears',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'ecl-2',
      projectId: 'project-1',
      episodeId: 'episode-1',
      characterId: 'character-2',
      usageType: 'appears',
      createdAt: now,
      updatedAt: now,
    },
  ])
  await db.insert(episodeSceneLinks).values({
    id: 'esl-1',
    projectId: 'project-1',
    episodeId: 'episode-1',
    sceneId: 'scene-1',
    usageType: 'used',
    createdAt: now,
    updatedAt: now,
  })
  await db.insert(storyboards).values({
    id: 'storyboard-1',
    projectId: 'project-1',
    episodeId: 'episode-1',
    shotNo: 1,
    duration: 5,
    sceneId: 'scene-1',
    characterIdsJson: JSON.stringify(['character-1']),
    propIdsJson: JSON.stringify(['prop-1']),
    scriptSectionNo: 1,
    shotType: 'medium',
    cameraAngle: 'eye-level',
    cameraMovement: 'static',
    action: '林薇 walks into the banquet hall',
    dialogueJson: JSON.stringify([{ speaker: '林薇', line: '我来了。' }]),
    narration: null,
    emotion: 'tense',
    imagePrompt: 'cinematic shot of a woman entering a banquet hall',
    videoPrompt: 'slow push-in',
    firstFrameImageUrl: null,
    lastFrameImageUrl: null,
    videoUrl: null,
    ttsAudioUrl: null,
    subtitleUrl: null,
    composedVideoUrl: null,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  })

  const imageProvider = new MockImageProvider(
    responseFactory ?? ((request) => `/static/mock-images/${String(request.metadata?.targetId)}.png`),
  )
  const app = new Hono()
  app.route('/', createImageGenerationRoutes({ db, imageProvider }))

  return { app, db }
}

describe('episode batch image generation routes', () => {
  it('generates character images for the episode and writes back reference urls', async () => {
    const { app, db } = await createTestApp()

    const res = await app.request('/api/episodes/episode-1/generate-character-images', { method: 'POST' })
    expect(res.status).toBe(200)
    const envelope = (await res.json()) as ApiResponse<BatchResultBody>
    expect(envelope.code).toBe(0)
    const body = envelope.data
    expect(body.targetType).toBe('character_reference_image')
    expect(body.summary).toEqual({ total: 2, completed: 2, skipped: 0, failed: 0 })

    const [character] = await db.select().from(characters).where(eq(characters.id, 'character-1'))
    expect(character.referenceImageUrl).toBe('/static/mock-images/character-1.png')

    const characterAssets = await db
      .select()
      .from(assets)
      .where(and(eq(assets.targetType, 'character_reference_image'), eq(assets.status, 'active')))
    expect(characterAssets).toHaveLength(2)
  })

  it('skips characters that already have an image by default', async () => {
    const { app, db } = await createTestApp()

    await db
      .update(characters)
      .set({ referenceImageUrl: '/static/mock-images/existing-character-1.png' })
      .where(eq(characters.id, 'character-1'))

    const res = await app.request('/api/episodes/episode-1/generate-character-images', { method: 'POST' })
    const body = ((await res.json()) as ApiResponse<BatchResultBody>).data
    expect(body.summary).toEqual({ total: 2, completed: 1, skipped: 1, failed: 0 })

    const skipped = body.results.find((r) => r.targetId === 'character-1')
    expect(skipped?.status).toBe('skipped')
    expect(skipped?.taskId).toBeUndefined()

    // No task should have been created for the skipped character.
    const tasks = await db
      .select()
      .from(generationTasks)
      .where(eq(generationTasks.targetId, 'character-1'))
    expect(tasks).toHaveLength(0)

    // The pre-existing url must be untouched.
    const [character] = await db.select().from(characters).where(eq(characters.id, 'character-1'))
    expect(character.referenceImageUrl).toBe('/static/mock-images/existing-character-1.png')
  })

  it('regenerates with force=true and supersedes old assets without deleting them', async () => {
    const { app, db } = await createTestApp((request) => `/static/mock-images/regenerated-${String(request.metadata?.targetId)}.png`)

    // First pass creates the images.
    await app.request('/api/episodes/episode-1/generate-scene-images', { method: 'POST' })
    const [firstAsset] = await db
      .select()
      .from(assets)
      .where(and(eq(assets.targetType, 'scene_reference_image'), eq(assets.targetId, 'scene-1')))
    expect(firstAsset.status).toBe('active')

    // Second pass with force regenerates.
    const res = await app.request('/api/episodes/episode-1/generate-scene-images?force=true', { method: 'POST' })
    const body = ((await res.json()) as ApiResponse<BatchResultBody>).data
    expect(body.summary).toEqual({ total: 1, completed: 1, skipped: 0, failed: 0 })

    // Old asset still exists, now superseded.
    const [oldAsset] = await db.select().from(assets).where(eq(assets.id, firstAsset.id))
    expect(oldAsset).toBeTruthy()
    expect(oldAsset.status).toBe('superseded')

    const activeAssets = await db
      .select()
      .from(assets)
      .where(
        and(
          eq(assets.targetType, 'scene_reference_image'),
          eq(assets.targetId, 'scene-1'),
          eq(assets.status, 'active'),
        ),
      )
    expect(activeAssets).toHaveLength(1)

    const [scene] = await db.select().from(scenes).where(eq(scenes.id, 'scene-1'))
    expect(scene.referenceImageUrl).toBe('/static/mock-images/regenerated-scene-1.png')
  })

  it('generate-all-images runs characters and scenes before storyboard first frames', async () => {
    let storyboardPrompt: string | undefined
    const { app } = await createTestApp((request) => {
      if (request.metadata?.targetType === 'storyboard_first_frame') {
        storyboardPrompt = request.prompt
      }
      return `/static/mock-images/${String(request.metadata?.targetId)}.png`
    })

    const res = await app.request('/api/episodes/episode-1/generate-all-images', { method: 'POST' })
    expect(res.status).toBe(200)
    const body = ((await res.json()) as ApiResponse<{
      characters: BatchResultBody
      scenes: BatchResultBody
      storyboardFirstFrames: BatchResultBody
    }>).data
    expect(body.characters.summary.completed).toBe(2)
    expect(body.scenes.summary.completed).toBe(1)
    expect(body.storyboardFirstFrames.summary.completed).toBe(1)

    // Because characters/scenes ran first, the storyboard prompt references their generated urls.
    expect(storyboardPrompt).toContain('Character reference image: /static/mock-images/character-1.png')
    expect(storyboardPrompt).toContain('Scene reference image: /static/mock-images/scene-1.png')
  })

  it('reports image generation status with total/completed/missing/failed', async () => {
    const { app, db } = await createTestApp((request) => {
      if (request.metadata?.targetId === 'character-2') {
        throw new Error('mock provider failed for character-2')
      }
      return `/static/mock-images/${String(request.metadata?.targetId)}.png`
    })

    await app.request('/api/episodes/episode-1/generate-character-images', { method: 'POST' })

    const res = await app.request('/api/episodes/episode-1/image-generation-status')
    expect(res.status).toBe(200)
    const envelope = (await res.json()) as ApiResponse<{
      characters: { total: number; completed: number; missing: number; failed: number }
      scenes: { total: number; completed: number; missing: number; failed: number }
      storyboardFirstFrames: { total: number; completed: number; missing: number; failed: number }
    }>
    expect(envelope.code).toBe(0)
    const body = envelope.data

    expect(body.characters).toEqual({ total: 2, completed: 1, missing: 1, failed: 1 })
    expect(body.scenes).toEqual({ total: 1, completed: 0, missing: 1, failed: 0 })
    expect(body.storyboardFirstFrames).toEqual({ total: 1, completed: 0, missing: 1, failed: 0 })

    // Confirm the failed task was recorded.
    const failedTasks = await db
      .select()
      .from(generationTasks)
      .where(and(eq(generationTasks.targetId, 'character-2'), eq(generationTasks.status, 'failed')))
    expect(failedTasks).toHaveLength(1)
  })

  it('returns 404 for an unknown episode', async () => {
    const { app } = await createTestApp()

    const genRes = await app.request('/api/episodes/missing/generate-character-images', { method: 'POST' })
    expect(genRes.status).toBe(404)
    const genBody = (await genRes.json()) as ApiResponse<null>
    expect(genBody.code).toBe(40401)

    const statusRes = await app.request('/api/episodes/missing/image-generation-status')
    expect(statusRes.status).toBe(404)
    const statusBody = (await statusRes.json()) as ApiResponse<null>
    expect(statusBody.code).toBe(40401)
  })
})
