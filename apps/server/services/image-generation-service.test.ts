import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import {
  assets,
  characters,
  createDatabase,
  episodes,
  generationTasks,
  initializeDatabase,
  projects,
  scenes,
  storyboards,
  type DatabaseClient,
} from '../../../packages/database/index.js'
import {
  MockImageProvider,
  type ImageGenerationRequest,
  type ImageProvider,
} from '../../../packages/providers/index.js'
import { startTestWorker } from '../test-helpers/task-worker.js'
import {
  ImageGenerationServiceError,
  startCharacterReferenceImageGeneration,
  startImageGeneration,
  startSceneReferenceImageGeneration,
} from './image-generation-service.js'

async function createTestDb() {
  const db = await createDatabase(':memory:')
  await initializeDatabase(db)
  return db
}

/**
 * Builds service deps whose worker shares the given imageProvider, so the async start* paths are
 * actually driven to completion (the worker's image handler uses this exact provider instance).
 */
function imageDeps(db: DatabaseClient, imageProvider: ImageProvider) {
  const worker = startTestWorker(db, { imageProvider })
  return { db, imageProvider, scheduler: worker }
}

describe('image-generation-service', () => {
  it('generates a character reference image asset', async () => {
    const db = await createTestDb()
    await seedImageGenerationContext(db)
    let providerRequest: ImageGenerationRequest | undefined

    const result = await startImageGeneration(
      imageDeps(
        db,
        new MockImageProvider((request) => {
          providerRequest = request
          return '/static/mock-images/character.png'
        }),
      ),
      'project-1',
      {
        target_type: 'character_reference_image',
        target_id: 'character-1',
      },
    )

    await waitForTask(db, result.taskId)

    const [task] = await db.select().from(generationTasks).where(eq(generationTasks.id, result.taskId))
    expect(task.status).toBe('completed')
    expect(task.taskType).toBe('image_generation')
    expect(task.targetType).toBe('character_reference_image')
    expect(task.targetId).toBe('character-1')

    expect(providerRequest?.prompt).toContain('林晚')
    expect(providerRequest?.prompt).toContain('protagonist')
    expect(providerRequest?.prompt).toContain('black dress, calm but determined expression')
    expect(providerRequest?.prompt).toContain('calm and decisive')
    expect(providerRequest?.prompt).toContain('Project visual style: realistic')

    const [asset] = await db.select().from(assets).where(eq(assets.generationTaskId, result.taskId))
    expect(asset.url).toBe('/static/mock-images/character.png')
    expect(asset.assetType).toBe('character_reference_image')

    const [character] = await db.select().from(characters).where(eq(characters.id, 'character-1'))
    expect(character.referenceImageUrl).toBe('/static/mock-images/character.png')
  })

  it('generates a scene reference image asset', async () => {
    const db = await createTestDb()
    await seedImageGenerationContext(db)

    const result = await startImageGeneration(
      imageDeps(db, new MockImageProvider(() => '/static/mock-images/scene.png')),
      'project-1',
      {
        target_type: 'scene_reference_image',
        target_id: 'scene-1',
      },
    )

    await waitForTask(db, result.taskId)

    const [scene] = await db.select().from(scenes).where(eq(scenes.id, 'scene-1'))
    expect(scene.referenceImageUrl).toBe('/static/mock-images/scene.png')
  })

  it('composes scene prompt from scene fields and project visual style', async () => {
    const db = await createTestDb()
    await seedImageGenerationContext(db)
    let providerRequest: ImageGenerationRequest | undefined

    const result = await startSceneReferenceImageGeneration(
      imageDeps(
        db,
        new MockImageProvider((request) => {
          providerRequest = request
          return '/static/mock-images/scene.png'
        }),
      ),
      'scene-1',
      {},
    )

    const task = await waitForTask(db, result.taskId)
    expect(task.status).toBe('completed')
    expect(task.targetType).toBe('scene_reference_image')
    expect(task.targetId).toBe('scene-1')

    expect(providerRequest?.prompt).toContain('realistic luxury banquet hall, dramatic lighting')
    expect(providerRequest?.prompt).toContain('宴会厅')
    expect(providerRequest?.prompt).toContain('luxury banquet hall for a public confrontation')
    expect(providerRequest?.prompt).toContain('interior')
    expect(providerRequest?.prompt).toContain('Project visual style: realistic')

    const [asset] = await db.select().from(assets).where(eq(assets.generationTaskId, result.taskId))
    expect(asset.assetType).toBe('scene_reference_image')
    expect(asset.status).toBe('active')

    const [scene] = await db.select().from(scenes).where(eq(scenes.id, 'scene-1'))
    expect(scene.referenceImageUrl).toBe('/static/mock-images/scene.png')
  })

  it('rejects scene regeneration without force when an image already exists', async () => {
    const db = await createTestDb()
    await seedImageGenerationContext(db)

    await db
      .update(scenes)
      .set({ referenceImageUrl: '/static/mock-images/existing-scene.png' })
      .where(eq(scenes.id, 'scene-1'))

    await expect(
      startSceneReferenceImageGeneration(
        imageDeps(db, new MockImageProvider(() => '/static/mock-images/scene.png')),
        'scene-1',
        {},
      ),
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it('regenerates scene reference images with force', async () => {
    const db = await createTestDb()
    await seedImageGenerationContext(db)
    const now = new Date().toISOString()

    await db
      .update(scenes)
      .set({ referenceImageUrl: '/static/mock-images/existing-scene.png' })
      .where(eq(scenes.id, 'scene-1'))

    await db.insert(assets).values({
      id: 'asset-existing-scene',
      projectId: 'project-1',
      assetType: 'scene_reference_image',
      targetType: 'scene_reference_image',
      targetId: 'scene-1',
      generationTaskId: null,
      url: '/static/mock-images/existing-scene.png',
      provider: 'mock',
      model: 'mock-image-v1',
      prompt: 'existing prompt',
      metadataJson: '{}',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })

    const result = await startSceneReferenceImageGeneration(
      imageDeps(db, new MockImageProvider(() => '/static/mock-images/regenerated-scene.png')),
      'scene-1',
      { force: true },
    )

    await waitForTask(db, result.taskId)

    const [oldAsset] = await db.select().from(assets).where(eq(assets.id, 'asset-existing-scene'))
    expect(oldAsset.status).toBe('superseded')

    const [newAsset] = await db.select().from(assets).where(eq(assets.generationTaskId, result.taskId))
    expect(newAsset.status).toBe('active')
    expect(newAsset.assetType).toBe('scene_reference_image')
    expect(newAsset.url).toBe('/static/mock-images/regenerated-scene.png')

    const [scene] = await db.select().from(scenes).where(eq(scenes.id, 'scene-1'))
    expect(scene.referenceImageUrl).toBe('/static/mock-images/regenerated-scene.png')
  })

  it('records failed scene image generation task errors', async () => {
    const db = await createTestDb()
    await seedImageGenerationContext(db)

    const result = await startSceneReferenceImageGeneration(
      imageDeps(
        db,
        new MockImageProvider(() => {
          throw new Error('mock scene provider failed')
        }),
      ),
      'scene-1',
      {},
    )

    const task = await waitForTask(db, result.taskId)
    expect(task.status).toBe('failed')
    expect(task.errorMessage).toBe('mock scene provider failed')
  })

  it('throws when generating an image for a missing scene', async () => {
    const db = await createTestDb()
    await seedImageGenerationContext(db)

    await expect(
      startSceneReferenceImageGeneration(
        imageDeps(db, new MockImageProvider(() => '/static/mock-images/scene.png')),
        'missing-scene',
        {},
      ),
    ).rejects.toBeInstanceOf(ImageGenerationServiceError)
  })

  it('generates a storyboard first frame asset', async () => {
    const db = await createTestDb()
    await seedImageGenerationContext(db)

    const result = await startImageGeneration(
      imageDeps(db, new MockImageProvider(() => '/static/mock-images/storyboard.png')),
      'project-1',
      {
        target_type: 'storyboard_first_frame',
        target_id: 'storyboard-1',
      },
    )

    await waitForTask(db, result.taskId)

    const [storyboard] = await db.select().from(storyboards).where(eq(storyboards.id, 'storyboard-1'))
    expect(storyboard.firstFrameImageUrl).toBe('/static/mock-images/storyboard.png')
  })

  it('rejects a missing target', async () => {
    const db = await createTestDb()
    await seedImageGenerationContext(db)

    await expect(
      startImageGeneration(imageDeps(db, new MockImageProvider()), 'project-1', {
        target_type: 'character_reference_image',
        target_id: 'missing-character',
      }),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('rejects an existing image without force', async () => {
    const db = await createTestDb()
    await seedImageGenerationContext(db)
    await db
      .update(characters)
      .set({ referenceImageUrl: '/static/mock-images/existing.png' })
      .where(eq(characters.id, 'character-1'))

    await expect(
      startImageGeneration(imageDeps(db, new MockImageProvider()), 'project-1', {
        target_type: 'character_reference_image',
        target_id: 'character-1',
      }),
    ).rejects.toBeInstanceOf(ImageGenerationServiceError)
  })

  it('starts character reference generation from character id', async () => {
    const db = await createTestDb()
    await seedImageGenerationContext(db)

    const result = await startCharacterReferenceImageGeneration(
      imageDeps(db, new MockImageProvider(() => '/static/mock-images/character-route.png')),
      'character-1',
      {},
    )

    await waitForTask(db, result.taskId)

    const [task] = await db.select().from(generationTasks).where(eq(generationTasks.id, result.taskId))
    expect(task.projectId).toBe('project-1')
    expect(task.targetType).toBe('character_reference_image')
    expect(task.targetId).toBe('character-1')
    expect(task.status).toBe('completed')

    const [character] = await db.select().from(characters).where(eq(characters.id, 'character-1'))
    expect(character.referenceImageUrl).toBe('/static/mock-images/character-route.png')
  })

  it('regenerates character reference images with force', async () => {
    const db = await createTestDb()
    await seedImageGenerationContext(db)
    const now = new Date().toISOString()
    await db
      .update(characters)
      .set({ referenceImageUrl: '/static/mock-images/existing.png' })
      .where(eq(characters.id, 'character-1'))
    await db.insert(assets).values({
      id: 'asset-existing',
      projectId: 'project-1',
      assetType: 'character_reference_image',
      targetType: 'character_reference_image',
      targetId: 'character-1',
      generationTaskId: null,
      url: '/static/mock-images/existing.png',
      provider: 'mock',
      model: 'mock-image-v1',
      prompt: 'existing prompt',
      metadataJson: '{}',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })

    const result = await startCharacterReferenceImageGeneration(
      imageDeps(db, new MockImageProvider(() => '/static/mock-images/regenerated.png')),
      'character-1',
      { force: true },
    )

    await waitForTask(db, result.taskId)

    const [oldAsset] = await db.select().from(assets).where(eq(assets.id, 'asset-existing'))
    expect(oldAsset.status).toBe('superseded')

    const [newAsset] = await db.select().from(assets).where(eq(assets.generationTaskId, result.taskId))
    expect(newAsset.status).toBe('active')
    expect(newAsset.assetType).toBe('character_reference_image')
    expect(newAsset.url).toBe('/static/mock-images/regenerated.png')

    const [character] = await db.select().from(characters).where(eq(characters.id, 'character-1'))
    expect(character.referenceImageUrl).toBe('/static/mock-images/regenerated.png')
  })

  it('records failed image generation task errors', async () => {
    const db = await createTestDb()
    await seedImageGenerationContext(db)

    const result = await startCharacterReferenceImageGeneration(
      imageDeps(
        db,
        new MockImageProvider(() => {
          throw new Error('mock provider failed')
        }),
      ),
      'character-1',
      {},
    )

    const task = await waitForTask(db, result.taskId)
    expect(task.status).toBe('failed')
    expect(task.errorMessage).toBe('mock provider failed')
  })
})

async function seedImageGenerationContext(db: DatabaseClient) {
  const now = new Date().toISOString()

  await db.insert(projects).values({
    id: 'project-1',
    title: 'Phase 2A test project',
    description: 'Image generation infrastructure smoke test.',
    genre: 'revenge',
    targetPlatform: 'douyin',
    visualStyle: 'realistic',
    episodeDuration: 60,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  })

  await db.insert(characters).values({
    id: 'character-1',
    projectId: 'project-1',
    name: '林晚',
    aliasJson: '[]',
    role: 'protagonist',
    age: '25',
    gender: 'female',
    appearance: 'black dress, calm but determined expression',
    personality: 'calm and decisive',
    background: null,
    relationshipJson: '[]',
    referenceImageUrl: null,
    voiceId: null,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  })

  await db.insert(scenes).values({
    id: 'scene-1',
    projectId: 'project-1',
    name: '宴会厅',
    description: 'luxury banquet hall for a public confrontation',
    locationType: 'interior',
    visualStyle: 'realistic',
    visualPrompt: 'realistic luxury banquet hall, dramatic lighting',
    referenceImageUrl: null,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  })

  await db.insert(episodes).values({
    id: 'episode-1',
    projectId: 'project-1',
    episodeNo: 1,
    title: '第1集',
    summary: 'A confrontation begins.',
    openingHook: 'A dramatic moment begins.',
    endingHook: 'A cliffhanger lands.',
    scriptId: null,
    videoUrl: null,
    status: 'storyboard_ready',
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
    propIdsJson: '[]',
    scriptSectionNo: 1,
    shotType: 'medium',
    cameraAngle: 'eye_level',
    cameraMovement: 'static',
    action: 'Lin Wan enters the banquet hall.',
    dialogueJson: '[]',
    narration: null,
    emotion: 'tense',
    imagePrompt: 'cinematic medium shot of a determined woman entering a luxury banquet hall',
    videoPrompt: 'static eye-level camera, dramatic entrance',
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
}

async function waitForTask(db: DatabaseClient, taskId: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const [task] = await db.select().from(generationTasks).where(eq(generationTasks.id, taskId))

    if (task?.status === 'completed' || task?.status === 'failed') {
      return task
    }

    await new Promise((resolve) => setTimeout(resolve, 5))
  }

  throw new Error(`Timed out waiting for task: ${taskId}`)
}
