import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import {
  assets,
  characters,
  createDatabase,
  episodes,
  generationTasks,
  initializeDatabase,
  novelChapters,
  novelEvents,
  projects,
  storyboards,
} from '../../../packages/database/index.js'
import { MockStructuredTextProvider } from '../../../packages/providers/index.js'
import { startTestWorker } from '../test-helpers/task-worker.js'
import { createProjectRoutes } from './project.js'

interface ApiResponse<T> {
  code: number
  message: string
  data: T
}

async function createTestApp() {
  const db = await createDatabase(':memory:')
  await initializeDatabase(db)
  const provider = new MockStructuredTextProvider(() => ({
    title: '重生之当众撕开真相',
    description: '林晚在订婚宴上发现未婚夫与亲姐密谋夺产，她选择当众揭穿。',
    genre: '复仇',
    visualStyle: '现代都市，冷色调电影感灯光。',
  }))
  const worker = startTestWorker(db, { provider })
  const app = new Hono()
  app.route('/', createProjectRoutes({ db, provider, scheduler: worker }))
  return { app, db }
}

/** Waits for the fire-and-forget profile agent kicked off by from-novel to settle. */
async function waitForTask(db: Awaited<ReturnType<typeof createDatabase>>, taskId: string) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const [task] = await db.select().from(generationTasks).where(eq(generationTasks.id, taskId)).limit(1)
    if (task && task.status !== 'pending' && task.status !== 'running') {
      return task
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error(`Task did not settle: ${taskId}`)
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
    expect(listBody.projects[0]).toMatchObject({
      chapterCount: 1,
      episodeCount: 1,
      scriptCount: 0,
      storyboardCount: 1,
      storyboardEpisodeCount: 1,
      imageCompletion: 50,
    })

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

  it('updates project basic information', async () => {
    const { app } = await createTestApp()

    const createResponse = await app.request('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Original title',
        description: 'Original description',
        genre: 'drama',
        targetPlatform: 'short_video',
        visualStyle: 'realistic',
        episodeDuration: 60,
      }),
    })
    const created = ((await createResponse.json()) as ApiResponse<{ project: { id: string } }>).data.project

    const updateResponse = await app.request(`/api/projects/${created.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Updated title',
        description: null,
        genre: 'suspense',
        targetPlatform: 'mini_series',
        visualStyle: 'cinematic noir',
        episodeDuration: 75,
      }),
    })

    expect(updateResponse.status).toBe(200)
    const updateEnvelope = (await updateResponse.json()) as ApiResponse<{
      project: {
        id: string
        title: string
        description: string | null
        genre: string
        targetPlatform: string
        visualStyle: string
        episodeDuration: number
      }
    }>
    expect(updateEnvelope.code).toBe(0)
    expect(updateEnvelope.data.project).toMatchObject({
      id: created.id,
      title: 'Updated title',
      description: null,
      genre: 'suspense',
      targetPlatform: 'mini_series',
      visualStyle: 'cinematic noir',
      episodeDuration: 75,
    })

    const detailResponse = await app.request(`/api/projects/${created.id}`)
    const detailEnvelope = (await detailResponse.json()) as ApiResponse<{ project: { title: string } }>
    expect(detailEnvelope.data.project.title).toBe('Updated title')
  })

  it('rejects invalid project update payloads', async () => {
    const { app } = await createTestApp()

    const response = await app.request('/api/projects/project-1', {
      method: 'PATCH',
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

  it('returns 404 when updating a missing project', async () => {
    const { app } = await createTestApp()

    const response = await app.request('/api/projects/missing-project', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Updated title' }),
    })

    expect(response.status).toBe(404)
    const body = (await response.json()) as ApiResponse<null>
    expect(body.code).toBe(40401)
  })

  it('imports chapters appending after the existing max chapterNo', async () => {
    const { app, db } = await createTestApp()

    const createResponse = await app.request('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '午夜信号' }),
    })
    const createEnvelope = (await createResponse.json()) as ApiResponse<{ project: { id: string } }>
    const projectId = createEnvelope.data.project.id

    const now = new Date().toISOString()
    await db.insert(novelChapters).values({
      id: 'chapter-existing',
      projectId,
      chapterNo: 3,
      title: '既有章节',
      content: 'existing content',
      wordCount: 16,
      source: null,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    })

    const response = await app.request(`/api/projects/${projectId}/chapters/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        source: 'paste',
        chapters: [
          { title: '第一章 深夜来电', content: '正文 第一章。' },
          { title: null, content: '正文第二章。' },
        ],
      }),
    })

    expect(response.status).toBe(201)
    const envelope = (await response.json()) as ApiResponse<{
      chapters: { chapterNo: number; title: string | null; wordCount: number; source: string | null; status: string }[]
    }>
    expect(envelope.code).toBe(0)
    expect(envelope.data.chapters).toHaveLength(2)
    expect(envelope.data.chapters[0]).toMatchObject({
      chapterNo: 4,
      title: '第一章 深夜来电',
      wordCount: '正文第一章。'.length,
      source: 'paste',
      status: 'pending',
    })
    expect(envelope.data.chapters[1]).toMatchObject({ chapterNo: 5, title: null })

    const persisted = await db.select().from(novelChapters)
    expect(persisted).toHaveLength(3)
  })

  it('returns 404 when importing chapters into a missing project', async () => {
    const { app } = await createTestApp()

    const response = await app.request('/api/projects/missing-project/chapters/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: 'paste', chapters: [{ title: null, content: '正文。' }] }),
    })

    expect(response.status).toBe(404)
    const body = (await response.json()) as ApiResponse<null>
    expect(body.code).toBe(40401)
  })

  it('creates a draft project from a novel and completes the profile task', async () => {
    const { app, db } = await createTestApp()

    const response = await app.request('/api/projects/from-novel', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        source: 'epub',
        novelMeta: { title: '重生复仇录', author: '佚名' },
        chapters: [
          { title: '第一章 归来', content: '林晚回到宴会厅，发现未婚夫正在密谋。' },
          { title: '第二章 对峙', content: '她压下怒火，决定当众揭穿他们。' },
        ],
      }),
    })

    expect(response.status).toBe(201)
    const envelope = (await response.json()) as ApiResponse<{
      project: { id: string; title: string; status: string }
      chapters: { chapterNo: number; source: string }[]
      taskId: string
      taskStatus: string
    }>
    expect(envelope.code).toBe(0)
    // Draft title falls back to the EPUB metadata title before AI confirmation.
    expect(envelope.data.project).toMatchObject({ title: '重生复仇录', status: 'draft' })
    expect(envelope.data.chapters).toHaveLength(2)
    expect(envelope.data.chapters[0]).toMatchObject({ chapterNo: 1, source: 'epub' })
    expect(envelope.data.taskStatus).toBe('pending')

    const chapters = await db
      .select()
      .from(novelChapters)
      .where(eq(novelChapters.projectId, envelope.data.project.id))
    expect(chapters).toHaveLength(2)

    const task = await waitForTask(db, envelope.data.taskId)
    expect(task.status).toBe('completed')
    expect(task.taskType).toBe('project_profile')
    expect(JSON.parse(task.outputJson ?? '{}')).toMatchObject({ genre: '复仇' })

    // The suggestion is not auto-applied; the project row keeps its draft values.
    const [project] = await db.select().from(projects).where(eq(projects.id, envelope.data.project.id))
    expect(project.title).toBe('重生复仇录')
    expect(project.genre).toBe('drama')
  })

  it('rejects from-novel payloads without chapters', async () => {
    const { app } = await createTestApp()

    const response = await app.request('/api/projects/from-novel', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: 'paste', chapters: [] }),
    })

    expect(response.status).toBe(400)
    const body = (await response.json()) as ApiResponse<{ issues: unknown[] }>
    expect(body.code).toBe(40001)
  })

  it('deletes a project and cascades all dependent rows', async () => {
    const { app, db } = await createTestApp()

    const createResponse = await app.request('/api/projects/from-novel', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        source: 'paste',
        chapters: [{ title: '第一章', content: '正文。' }],
      }),
    })
    const created = ((await createResponse.json()) as ApiResponse<{ project: { id: string }; taskId: string }>).data
    await waitForTask(db, created.taskId)

    const deleteResponse = await app.request(`/api/projects/${created.project.id}`, { method: 'DELETE' })
    expect(deleteResponse.status).toBe(200)

    const remainingProjects = await db.select().from(projects).where(eq(projects.id, created.project.id))
    expect(remainingProjects).toHaveLength(0)
    const remainingChapters = await db
      .select()
      .from(novelChapters)
      .where(eq(novelChapters.projectId, created.project.id))
    expect(remainingChapters).toHaveLength(0)
    const remainingTasks = await db
      .select()
      .from(generationTasks)
      .where(eq(generationTasks.projectId, created.project.id))
    expect(remainingTasks).toHaveLength(0)
  })

  it('returns 404 when deleting a missing project', async () => {
    const { app } = await createTestApp()

    const response = await app.request('/api/projects/missing-project', { method: 'DELETE' })
    expect(response.status).toBe(404)
    const body = (await response.json()) as ApiResponse<null>
    expect(body.code).toBe(40401)
  })
})
