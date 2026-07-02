import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import {
  assets,
  characters,
  createDatabase,
  episodes,
  generationTasks,
  initializeDatabase,
  projects,
  props,
  scenes,
  storyboards,
  type DatabaseClient,
} from '../../../packages/database/index.js'
import { MockImageProvider, MockStructuredTextProvider } from '../../../packages/providers/index.js'
import { createImageGenerationRoutes } from './image-generation.js'
import { createStoryboardRoutes } from './storyboard.js'

interface ApiResponse<T> {
  code: number
  message: string
  data: T
}

async function createTestApp(imageUrl = '/static/mock-images/storyboard-route.png') {
  const db = await createDatabase(':memory:')
  initializeDatabase(db)

  const now = new Date().toISOString()
  await db.insert(projects).values({
    id: 'project-1',
    title: 'Storyboard route test project',
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
    referenceImageUrl: '/static/mock-images/scene-1.png',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  })
  await db.insert(characters).values({
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
    referenceImageUrl: '/static/mock-images/character-1.png',
    voiceId: null,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  })
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

  const provider = new MockStructuredTextProvider()
  const imageProvider = new MockImageProvider(() => imageUrl)
  const app = new Hono()
  app.route('/', createStoryboardRoutes({ db, provider }))
  app.route('/', createImageGenerationRoutes({ db, imageProvider }))

  return { app, db }
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

describe('storyboard first-frame image generation routes', () => {
  it('starts a storyboard first-frame task and exposes the url via GET /api/storyboards/:id', async () => {
    const { app, db } = await createTestApp()

    const startRes = await app.request('/api/storyboards/storyboard-1/generate-first-frame', { method: 'POST' })
    expect(startRes.status).toBe(202)
    const startEnvelope = (await startRes.json()) as ApiResponse<{ taskId: string; status: string }>
    expect(startEnvelope.code).toBe(0)
    const startBody = startEnvelope.data
    expect(startBody.status).toBe('pending')
    expect(startBody.taskId).toBeTruthy()

    const task = await waitForTask(db, startBody.taskId)
    expect(task.status).toBe('completed')
    expect(task.storyboardId).toBe('storyboard-1')

    const sbRes = await app.request('/api/storyboards/storyboard-1')
    expect(sbRes.status).toBe(200)
    const sbEnvelope = (await sbRes.json()) as ApiResponse<{ storyboard: { firstFrameImageUrl: string | null } }>
    expect(sbEnvelope.code).toBe(0)
    const sbBody = sbEnvelope.data
    expect(sbBody.storyboard.firstFrameImageUrl).toBe('/static/mock-images/storyboard-route.png')

    const [asset] = await db
      .select()
      .from(assets)
      .where(and(eq(assets.targetType, 'storyboard_first_frame'), eq(assets.targetId, 'storyboard-1')))
    expect(asset).toBeTruthy()
    expect(asset.assetType).toBe('storyboard_first_frame')
    expect(asset.status).toBe('active')
    expect(asset.url).toBe('/static/mock-images/storyboard-route.png')
  })

  it('returns 409 on regeneration without force and 202 with force=true', async () => {
    const { app, db } = await createTestApp()

    const first = await app.request('/api/storyboards/storyboard-1/generate-first-frame', { method: 'POST' })
    expect(first.status).toBe(202)
    await waitForTask(db, ((await first.json()) as ApiResponse<{ taskId: string }>).data.taskId)

    const conflict = await app.request('/api/storyboards/storyboard-1/generate-first-frame', { method: 'POST' })
    expect(conflict.status).toBe(409)
    const conflictBody = (await conflict.json()) as ApiResponse<null>
    expect(conflictBody.code).toBe(40901)

    const forced = await app.request('/api/storyboards/storyboard-1/generate-first-frame?force=true', {
      method: 'POST',
    })
    expect(forced.status).toBe(202)
    await waitForTask(db, ((await forced.json()) as ApiResponse<{ taskId: string }>).data.taskId)

    const activeAssets = await db
      .select()
      .from(assets)
      .where(
        and(
          eq(assets.targetType, 'storyboard_first_frame'),
          eq(assets.targetId, 'storyboard-1'),
          eq(assets.status, 'active'),
        ),
      )
    expect(activeAssets).toHaveLength(1)
  })

  it('returns 404 for an unknown storyboard', async () => {
    const { app } = await createTestApp()

    const res = await app.request('/api/storyboards/missing/generate-first-frame', { method: 'POST' })
    expect(res.status).toBe(404)
    const body = (await res.json()) as ApiResponse<null>
    expect(body.code).toBe(40401)

    const getRes = await app.request('/api/storyboards/missing')
    expect(getRes.status).toBe(404)
    const getBody = (await getRes.json()) as ApiResponse<null>
    expect(getBody.code).toBe(40401)
  })
})
