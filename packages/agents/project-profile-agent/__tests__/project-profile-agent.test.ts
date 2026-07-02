import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { createDatabase, initializeDatabase, type DatabaseClient } from '../../../database/index.js'
import { agentRuns, generationTasks, novelChapters, projects } from '../../../database/index.js'
import { MockStructuredTextProvider, type StructuredTextProvider } from '../../../providers/index.js'
import { runProjectProfileAgent } from '../service.js'

async function createTestDb() {
  const db = await createDatabase(':memory:')
  initializeDatabase(db)
  return db
}

async function seedProjectWithChapters(db: DatabaseClient) {
  const now = new Date().toISOString()

  await db.insert(projects).values({
    id: 'project-1',
    title: '未命名项目',
    description: null,
    genre: 'drama',
    targetPlatform: 'short_video',
    visualStyle: 'realistic',
    episodeDuration: 60,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  })

  await db.insert(novelChapters).values([
    {
      id: 'chapter-1',
      projectId: 'project-1',
      chapterNo: 1,
      title: '第一章 归来',
      content: '林晚回到宴会厅，发现未婚夫正在与姐姐密谋夺走公司。',
      wordCount: 24,
      source: 'epub',
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'chapter-2',
      projectId: 'project-1',
      chapterNo: 2,
      title: '第二章 对峙',
      content: '她压下怒火，决定当众揭穿他们。',
      wordCount: 14,
      source: 'epub',
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    },
  ])
}

const validProfile = {
  title: '重生之当众撕开真相',
  description: '林晚在订婚宴上发现未婚夫与亲姐密谋夺产，她选择当众揭穿，开启复仇之路。',
  genre: '复仇',
  visualStyle: '现代都市宴会场景，冷色调电影感灯光，写实风格。',
}

describe('ProjectProfileAgent', () => {
  it('profiles the project and stores the suggestion in run/task outputJson only', async () => {
    const db = await createTestDb()
    await seedProjectWithChapters(db)

    const provider = new MockStructuredTextProvider(() => validProfile)

    const result = await runProjectProfileAgent({
      db,
      provider,
      input: {
        projectId: 'project-1',
        novelMeta: { title: '重生复仇录', author: '佚名' },
      },
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual(validProfile)
    }

    const [run] = await db.select().from(agentRuns).limit(1)
    expect(run.status).toBe('completed')
    expect(run.agentType).toBe('ProjectProfileAgent')
    expect(JSON.parse(run.outputJson ?? '{}')).toEqual(validProfile)

    const [task] = await db.select().from(generationTasks).limit(1)
    expect(task.status).toBe('completed')
    expect(task.taskType).toBe('project_profile')
    expect(JSON.parse(task.outputJson ?? '{}')).toEqual(validProfile)

    // The suggestion must NOT be applied to the projects row before user confirmation.
    const [project] = await db.select().from(projects).where(eq(projects.id, 'project-1'))
    expect(project.title).toBe('未命名项目')
    expect(project.genre).toBe('drama')
  })

  it('updates an existing pending task when taskId is provided', async () => {
    const db = await createTestDb()
    await seedProjectWithChapters(db)

    const now = new Date().toISOString()
    await db.insert(generationTasks).values({
      id: 'task-1',
      projectId: 'project-1',
      episodeId: null,
      storyboardId: null,
      taskType: 'project_profile',
      provider: 'mock',
      model: 'mock-model',
      inputJson: '{}',
      outputJson: null,
      status: 'pending',
      retryCount: 0,
      errorMessage: null,
      startedAt: null,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    })

    const provider = new MockStructuredTextProvider(() => validProfile)
    const result = await runProjectProfileAgent({
      db,
      provider,
      input: { projectId: 'project-1', taskId: 'task-1' },
    })

    expect(result.success).toBe(true)
    expect(result.taskId).toBe('task-1')

    const [task] = await db.select().from(generationTasks).where(eq(generationTasks.id, 'task-1'))
    expect(task.status).toBe('completed')
    expect(task.startedAt).toBeTruthy()
  })

  it('marks run and task failed when the provider throws', async () => {
    const db = await createTestDb()
    await seedProjectWithChapters(db)

    const provider: StructuredTextProvider = {
      name: 'mock',
      model: 'throwing-model',
      async generateStructuredJson() {
        throw new Error('provider unavailable')
      },
    }

    const result = await runProjectProfileAgent({
      db,
      provider,
      input: { projectId: 'project-1' },
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('provider unavailable')
    }

    const [run] = await db.select().from(agentRuns).limit(1)
    expect(run.status).toBe('failed')

    const [task] = await db.select().from(generationTasks).limit(1)
    expect(task.status).toBe('failed')
  })

  it('fails explicitly when provider output violates the schema', async () => {
    const db = await createTestDb()
    await seedProjectWithChapters(db)

    const provider = new MockStructuredTextProvider(() => ({
      title: '',
      description: '',
      genre: '',
      visualStyle: '',
    }))

    const result = await runProjectProfileAgent({
      db,
      provider,
      input: { projectId: 'project-1' },
    })

    expect(result.success).toBe(false)

    const [run] = await db.select().from(agentRuns).limit(1)
    expect(run.status).toBe('failed')
    expect(run.errorMessage).toBeTruthy()
  })

  it('fails when the project has no chapters to profile', async () => {
    const db = await createTestDb()
    const now = new Date().toISOString()
    await db.insert(projects).values({
      id: 'project-empty',
      title: '空项目',
      description: null,
      genre: 'drama',
      targetPlatform: 'short_video',
      visualStyle: 'realistic',
      episodeDuration: 60,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    })

    const provider = new MockStructuredTextProvider(() => validProfile)
    const result = await runProjectProfileAgent({
      db,
      provider,
      input: { projectId: 'project-empty' },
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('no novel chapters')
    }
  })
})
