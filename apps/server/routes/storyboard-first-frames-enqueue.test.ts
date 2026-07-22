import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import {
  createDatabase,
  episodes,
  generationJobs,
  generationTasks,
  initializeDatabase,
  projects,
  storyboards,
  type DatabaseClient,
} from '../../../packages/database/index.js'
import { MockImageProvider } from '../../../packages/providers/index.js'
import type { TaskScheduler } from '../../../packages/tasks/index.js'
import { createImageGenerationRoutes } from './image-generation.js'

interface EnqueueBody {
  episodeId: string
  jobId: string | null
  total: number
  queued: string[]
  skipped: string[]
}

interface ApiResponse<T> {
  code: number
  message: string
  data: T
}

/**
 * A scheduler that records but never executes, so enqueued tasks stay `pending` for
 * deterministic assertions (the real worker would race to drain them).
 */
function stubScheduler(): TaskScheduler & { announced: string[]; notified: number } {
  const announced: string[] = []
  let notified = 0
  return {
    announced,
    get notified() {
      return notified
    },
    async announce(taskIds) {
      announced.push(...(Array.isArray(taskIds) ? taskIds : [taskIds]))
    },
    notify() {
      notified += 1
    },
  }
}

async function createTestApp() {
  const db = await createDatabase(':memory:')
  await initializeDatabase(db)

  const now = new Date().toISOString()
  await db.insert(projects).values({
    id: 'project-1',
    title: 'Enqueue first frames test',
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

  // Three shots; shot-2 already has a first frame.
  await db.insert(storyboards).values(
    [1, 2, 3].map((shotNo) => ({
      id: `storyboard-${shotNo}`,
      projectId: 'project-1',
      episodeId: 'episode-1',
      shotNo,
      duration: 5,
      sceneId: null,
      characterIdsJson: '[]',
      propIdsJson: '[]',
      scriptSectionNo: shotNo,
      shotType: 'medium',
      cameraAngle: null,
      cameraMovement: null,
      action: `action ${shotNo}`,
      dialogueJson: '[]',
      narration: null,
      emotion: null,
      imagePrompt: `cinematic shot ${shotNo}`,
      videoPrompt: 'push-in',
      firstFrameImageUrl: shotNo === 2 ? '/static/existing-2.png' : null,
      lastFrameImageUrl: null,
      videoUrl: null,
      ttsAudioUrl: null,
      subtitleUrl: null,
      composedVideoUrl: null,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    })),
  )

  const scheduler = stubScheduler()
  const app = new Hono()
  app.route(
    '/',
    createImageGenerationRoutes({ db, imageProvider: new MockImageProvider(), scheduler }),
  )

  return { app, db, scheduler }
}

async function pendingImageTasks(db: DatabaseClient) {
  return db.select().from(generationTasks).where(eq(generationTasks.taskType, 'image_generation'))
}

describe('POST /api/episodes/:episodeId/generate-storyboard-first-frames (async enqueue)', () => {
  it('enqueues shots missing a first frame and skips ones already generated', async () => {
    const { app, db, scheduler } = await createTestApp()

    const res = await app.request('/api/episodes/episode-1/generate-storyboard-first-frames', {
      method: 'POST',
    })
    expect(res.status).toBe(202)
    const body = ((await res.json()) as ApiResponse<EnqueueBody>).data

    expect(body.total).toBe(3)
    expect(body.queued).toHaveLength(2)
    expect(body.jobId).toBeTruthy()
    expect(body.skipped).toEqual(['storyboard-2'])

    const tasks = await pendingImageTasks(db)
    expect(tasks).toHaveLength(2)
    expect(tasks.every((t) => t.status === 'pending')).toBe(true)
    expect(tasks.map((t) => t.targetId).sort()).toEqual(['storyboard-1', 'storyboard-3'])
    expect(tasks.every((task) => task.jobId === body.jobId)).toBe(true)
    const [job] = await db.select().from(generationJobs).where(eq(generationJobs.id, body.jobId!))
    expect(job).toMatchObject({ totalCount: 2, pendingCount: 2, skippedCount: 1, status: 'pending' })
    // The worker is handed the freshly queued tasks.
    expect(scheduler.announced.sort()).toEqual([...body.queued].sort())
    expect(scheduler.notified).toBe(1)

    // The pre-existing image is untouched.
    const [shot2] = await db.select().from(storyboards).where(eq(storyboards.id, 'storyboard-2'))
    expect(shot2.firstFrameImageUrl).toBe('/static/existing-2.png')
  })

  it('scopes to storyboardIds and regenerates already-imaged shots with force', async () => {
    const { app, db } = await createTestApp()

    const res = await app.request('/api/episodes/episode-1/generate-storyboard-first-frames', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ storyboardIds: ['storyboard-2'], force: true }),
    })
    expect(res.status).toBe(202)
    const body = ((await res.json()) as ApiResponse<EnqueueBody>).data

    expect(body.total).toBe(1)
    expect(body.queued).toHaveLength(1)
    expect(body.skipped).toEqual([])

    const tasks = await pendingImageTasks(db)
    expect(tasks).toHaveLength(1)
    expect(tasks[0].targetId).toBe('storyboard-2')
    // force is carried into the task input so the worker supersedes the old image.
    expect(JSON.parse(tasks[0].inputJson).force).toBe(true)
  })

  it('skips shots that already have an image task in flight', async () => {
    const { app, db } = await createTestApp()

    // First pass leaves storyboard-1 and storyboard-3 pending.
    await app.request('/api/episodes/episode-1/generate-storyboard-first-frames', { method: 'POST' })

    // Second pass: those two are in flight, shot-2 has an image -> nothing to enqueue.
    const res = await app.request('/api/episodes/episode-1/generate-storyboard-first-frames', {
      method: 'POST',
    })
    const body = ((await res.json()) as ApiResponse<EnqueueBody>).data

    expect(body.queued).toEqual([])
    expect(body.skipped.sort()).toEqual(['storyboard-1', 'storyboard-2', 'storyboard-3'])

    // No duplicate tasks were created.
    const tasks = await pendingImageTasks(db)
    expect(tasks).toHaveLength(2)
  })

  it('returns NotFound (40401) for an unknown episode', async () => {
    const { app } = await createTestApp()

    const res = await app.request('/api/episodes/missing/generate-storyboard-first-frames', {
      method: 'POST',
    })
    expect(res.status).toBe(200)
    expect(((await res.json()) as ApiResponse<null>).code).toBe(40401)
  })
})
