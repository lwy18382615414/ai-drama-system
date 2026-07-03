import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { createDatabase, initializeDatabase, type DatabaseClient } from '../../../database/index.js'
import { agentRuns, generationTasks, novelChapters, novelEvents, projects } from '../../../database/index.js'
import { MockStructuredTextProvider, type StructuredTextProvider } from '../../../providers/index.js'
import { runEventAgent } from '../service.js'

async function createTestDb() {
  const db = await createDatabase(':memory:')
  await initializeDatabase(db)
  return db
}

async function seedChapter(db: DatabaseClient) {
  const now = new Date().toISOString()

  await db.insert(projects).values({
    id: 'project-1',
    title: '重生短剧测试',
    description: 'A local smoke-test project.',
    genre: 'revenge',
    targetPlatform: 'douyin',
    visualStyle: 'realistic',
    episodeDuration: 60,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  })

  await db.insert(novelChapters).values({
    id: 'chapter-1',
    projectId: 'project-1',
    chapterNo: 1,
    title: '归来',
    content: '林晚回到宴会厅，发现未婚夫正在与姐姐密谋夺走公司。她压下怒火，决定当众揭穿他们。',
    wordCount: 34,
    source: 'manual_input',
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  })
}

describe('EventAgent', () => {
  it('extracts events, writes novel_events, and completes run/task records', async () => {
    const db = await createTestDb()
    await seedChapter(db)

    const provider = new MockStructuredTextProvider((request) => ({
      chapterId: String(request.metadata?.chapterId),
      chapterSummary: '林晚发现背叛并决定反击。',
      events: [
        {
          eventNo: 1,
          eventType: 'revelation',
          summary: '林晚发现未婚夫和姐姐正在密谋夺走公司。',
          detail: '林晚回到宴会厅后听见两人密谋，意识到自己遭到亲近之人的背叛。',
          characters: ['林晚', '未婚夫', '姐姐'],
          location: '宴会厅',
          timeHint: '宴会期间',
          emotionTone: '震惊、压抑',
          conflictLevel: 'high',
          importance: 'critical',
          sourceTextRange: { start: 0, end: 28 },
        },
        {
          eventNo: 2,
          eventType: 'action',
          summary: '林晚压下怒火并决定当众揭穿阴谋。',
          detail: '她没有立刻爆发，而是选择在公众场合反击，让冲突升级为公开对峙。',
          characters: ['林晚'],
          location: '宴会厅',
          timeHint: '随后',
          emotionTone: '克制、决绝',
          conflictLevel: 'medium',
          importance: 'major',
          sourceTextRange: { start: 29, end: 42 },
        },
      ],
      totalEvents: 2,
    }))

    const result = await runEventAgent({
      db,
      provider,
      input: { projectId: 'project-1', chapterId: 'chapter-1' },
    })

    expect(result.success).toBe(true)

    const events = await db.select().from(novelEvents).where(eq(novelEvents.chapterId, 'chapter-1'))
    expect(events).toHaveLength(2)
    expect(events[0].eventNo).toBe(1)
    expect(events[0].summary).toContain('密谋')

    const [run] = await db.select().from(agentRuns).limit(1)
    expect(run.status).toBe('completed')
    expect(run.agentType).toBe('EventAgent')

    const [task] = await db.select().from(generationTasks).limit(1)
    expect(task.status).toBe('completed')
    expect(task.taskType).toBe('event_extraction')

    const [chapter] = await db.select().from(novelChapters).where(eq(novelChapters.id, 'chapter-1'))
    expect(chapter.status).toBe('event_extracted')
  })

  it('marks run and task failed when the provider throws', async () => {
    const db = await createTestDb()
    await seedChapter(db)

    const provider: StructuredTextProvider = {
      name: 'mock',
      model: 'throwing-model',
      async generateStructuredJson() {
        throw new Error('provider unavailable')
      },
    }

    const result = await runEventAgent({
      db,
      provider,
      input: { projectId: 'project-1', chapterId: 'chapter-1' },
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('provider unavailable')
    }

    const events = await db.select().from(novelEvents).where(eq(novelEvents.chapterId, 'chapter-1'))
    expect(events).toHaveLength(0)

    const [run] = await db.select().from(agentRuns).limit(1)
    expect(run.status).toBe('failed')

    const [task] = await db.select().from(generationTasks).limit(1)
    expect(task.status).toBe('failed')
  })

  it('fails explicitly when provider output violates the schema', async () => {
    const db = await createTestDb()
    await seedChapter(db)

    const provider = new MockStructuredTextProvider(() => ({
      chapterId: 'chapter-1',
      chapterSummary: '',
      events: [],
      totalEvents: 99,
    }))

    const result = await runEventAgent({
      db,
      provider,
      input: { projectId: 'project-1', chapterId: 'chapter-1' },
    })

    expect(result.success).toBe(false)

    const events = await db.select().from(novelEvents).where(eq(novelEvents.chapterId, 'chapter-1'))
    expect(events).toHaveLength(0)

    const [run] = await db.select().from(agentRuns).limit(1)
    expect(run.status).toBe('failed')
    expect(run.errorMessage).toBeTruthy()

    const [task] = await db.select().from(generationTasks).limit(1)
    expect(task.status).toBe('failed')
  })
})
