import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import {
  assets,
  characters,
  createDatabase,
  episodes,
  initializeDatabase,
  novelChapters,
  novelEvents,
  projects,
  storyboards,
} from '../../../packages/database/index.js'
import { createProjectRoutes } from './project.js'

interface ApiResponse<T> {
  code: number
  message: string
  data: T
}

async function createTestApp() {
  const db = await createDatabase(':memory:')
  initializeDatabase(db)
  const app = new Hono()
  app.route('/', createProjectRoutes({ db }))
  return { app, db }
}

describe('project routes', () => {
  it('creates, lists, and retrieves projects with aggregates', async () => {
    const { app, db } = await createTestApp()

    const createResponse = await app.request('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: '午夜信号',
        description: '都市悬疑短剧',
        genre: '都市悬疑',
        targetPlatform: 'short_video',
        visualStyle: 'cinematic noir',
        episodeDuration: 90,
      }),
    })

    expect(createResponse.status).toBe(201)
    const createEnvelope = (await createResponse.json()) as ApiResponse<{ project: { id: string; title: string } }>
    expect(createEnvelope.code).toBe(0)
    expect(createEnvelope.message).toBe('ok')
    const created = createEnvelope.data
    expect(created.project.title).toBe('午夜信号')

    const now = new Date().toISOString()
    await db.insert(novelChapters).values({
      id: 'chapter-1',
      projectId: created.project.id,
      chapterNo: 1,
      title: '频率',
      content: 'chapter content',
      wordCount: 100,
      source: null,
      status: 'extracted',
      createdAt: now,
      updatedAt: now,
    })
    await db.insert(novelEvents).values({
      id: 'event-1',
      projectId: created.project.id,
      chapterId: 'chapter-1',
      eventNo: 1,
      eventType: 'hook',
      summary: '深夜来电',
      detail: '林夏收到来电。',
      charactersJson: '[]',
      location: '直播间',
      timeHint: 'night',
      emotionTone: 'suspense',
      conflictLevel: 'high',
      importance: 'critical',
      sourceTextRangeJson: null,
      createdAt: now,
      updatedAt: now,
    })
    await db.insert(episodes).values({
      id: 'episode-1',
      projectId: created.project.id,
      episodeNo: 1,
      title: '深夜来电',
      summary: 'summary',
      openingHook: 'open',
      endingHook: 'end',
      scriptId: null,
      videoUrl: null,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    })
    await db.insert(characters).values({
      id: 'character-1',
      projectId: created.project.id,
      name: '林夏',
      aliasJson: '[]',
      role: '女主',
      age: null,
      gender: '女',
      appearance: null,
      personality: null,
      background: null,
      relationshipJson: '[]',
      referenceImageUrl: null,
      voiceId: null,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })
    await db.insert(storyboards).values({
      id: 'storyboard-1',
      projectId: created.project.id,
      episodeId: 'episode-1',
      shotNo: 1,
      duration: 3,
      sceneId: null,
      characterIdsJson: '[]',
      propIdsJson: '[]',
      scriptSectionNo: null,
      shotType: 'close_up',
      cameraAngle: null,
      cameraMovement: null,
      action: 'action',
      dialogueJson: '[]',
      narration: null,
      emotion: null,
      imagePrompt: 'prompt',
      videoPrompt: 'video prompt',
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
    await db.insert(assets).values({
      id: 'asset-1',
      projectId: created.project.id,
      assetType: 'character_reference_image',
      targetType: 'character',
      targetId: 'character-1',
      generationTaskId: null,
      url: '/static/mock.png',
      provider: 'mock',
      model: 'mock',
      prompt: 'prompt',
      metadataJson: '{}',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })

    const listResponse = await app.request('/api/projects')
    expect(listResponse.status).toBe(200)
    const listEnvelope = (await listResponse.json()) as ApiResponse<{ projects: unknown[] }>
    expect(listEnvelope.code).toBe(0)
    const listBody = listEnvelope.data
    expect(listBody.projects).toHaveLength(1)
    expect(listBody.projects[0]).toMatchObject({ episodeCount: 1, storyboardCount: 1, imageCompletion: 50 })

    const detailResponse = await app.request(`/api/projects/${created.project.id}`)
    expect(detailResponse.status).toBe(200)
    const detailEnvelope = (await detailResponse.json()) as ApiResponse<{ project: unknown }>
    expect(detailEnvelope.code).toBe(0)
    const detailBody = detailEnvelope.data
    expect(detailBody.project).toMatchObject({
      chapterCount: 1,
      eventCount: 1,
      episodeCount: 1,
      characterCount: 1,
      storyboardCount: 1,
      completedImages: 1,
    })
  })

  it('rejects invalid project creation payloads', async () => {
    const { app } = await createTestApp()

    const response = await app.request('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '' }),
    })

    expect(response.status).toBe(400)
    const body = (await response.json()) as ApiResponse<{ issues: unknown[] }>
    expect(body.code).toBe(40001)
    expect(body.message).toBe('Invalid request body')
    expect(body.data.issues).toBeTruthy()
  })

  it('returns 404 for missing project details', async () => {
    const { app } = await createTestApp()

    const response = await app.request('/api/projects/missing-project')
    expect(response.status).toBe(404)
    const body = (await response.json()) as ApiResponse<null>
    expect(body.code).toBe(40401)
    expect(body.message).toBe('Project not found')
    expect(body.data).toBeNull()
  })
})
