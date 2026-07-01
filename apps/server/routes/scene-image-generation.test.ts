import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import {
  createDatabase,
  generationTasks,
  initializeDatabase,
  projects,
  scenes,
  type DatabaseClient,
} from '../../../packages/database/index.js'
import { MockImageProvider, MockStructuredTextProvider } from '../../../packages/providers/index.js'
import { createAssetRoutes } from './assets.js'
import { createImageGenerationRoutes } from './image-generation.js'

async function createTestApp(imageUrl = '/static/mock-images/scene-route.png') {
  const db = await createDatabase(':memory:')
  initializeDatabase(db)

  const now = new Date().toISOString()
  await db.insert(projects).values({
    id: 'project-1',
    title: 'Scene route test project',
    description: null,
    genre: 'drama',
    targetPlatform: 'short_video',
    visualStyle: 'realistic',
    episodeDuration: 60,
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

  const provider = new MockStructuredTextProvider()
  const imageProvider = new MockImageProvider(() => imageUrl)
  const app = new Hono()
  app.route('/', createAssetRoutes({ db, provider }))
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

describe('scene image generation routes', () => {
  it('starts a scene reference image task and exposes it via GET /api/scenes/:sceneId', async () => {
    const { app, db } = await createTestApp()

    const startRes = await app.request('/api/scenes/scene-1/generate-image', { method: 'POST' })
    expect(startRes.status).toBe(202)
    const startBody = (await startRes.json()) as { taskId: string; status: string }
    expect(startBody.status).toBe('pending')
    expect(startBody.taskId).toBeTruthy()

    const task = await waitForTask(db, startBody.taskId)
    expect(task.status).toBe('completed')

    const sceneRes = await app.request('/api/scenes/scene-1')
    expect(sceneRes.status).toBe(200)
    const sceneBody = (await sceneRes.json()) as { scene: { reference_image_url: string | null } }
    expect(sceneBody.scene.reference_image_url).toBe('/static/mock-images/scene-route.png')
  })

  it('returns 409 on regeneration without force and 202 with force=true', async () => {
    const { app, db } = await createTestApp()

    const first = await app.request('/api/scenes/scene-1/generate-image', { method: 'POST' })
    expect(first.status).toBe(202)
    await waitForTask(db, ((await first.json()) as { taskId: string }).taskId)

    const conflict = await app.request('/api/scenes/scene-1/generate-image', { method: 'POST' })
    expect(conflict.status).toBe(409)

    const forced = await app.request('/api/scenes/scene-1/generate-image?force=true', { method: 'POST' })
    expect(forced.status).toBe(202)
  })

  it('returns 404 for an unknown scene', async () => {
    const { app } = await createTestApp()

    const res = await app.request('/api/scenes/missing/generate-image', { method: 'POST' })
    expect(res.status).toBe(404)

    const getRes = await app.request('/api/scenes/missing')
    expect(getRes.status).toBe(404)
  })
})
