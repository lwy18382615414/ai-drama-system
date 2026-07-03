import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { createDatabase, initializeDatabase, type DatabaseClient } from '../../../database/index.js'
import {
  agentRuns,
  episodeEventLinks,
  episodes,
  generationTasks,
  novelChapters,
  novelEvents,
  projects,
} from '../../../database/index.js'
import { MockStructuredTextProvider, type StructuredTextProvider } from '../../../providers/index.js'
import { runEpisodePlannerAgent } from '../service.js'
import type { EpisodePlannerInput, EpisodePlannerSourceEvent } from '../schema.js'

async function createTestDb() {
  const db = await createDatabase(':memory:')
  await initializeDatabase(db)
  return db
}

async function seedEvents(db: DatabaseClient) {
  const now = new Date().toISOString()

  await db.insert(projects).values({
    id: 'project-1',
    title: '重生短剧测试',
    description: 'A local episode planning project.',
    genre: 'revenge',
    targetPlatform: 'douyin',
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
      title: '归来',
      content: '林晚回到宴会厅，发现未婚夫和姐姐密谋夺走公司。',
      wordCount: 24,
      source: 'manual_input',
      status: 'event_extracted',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'chapter-2',
      projectId: 'project-1',
      chapterNo: 2,
      title: '反击',
      content: '林晚当众揭穿他们，并拿出关键证据。',
      wordCount: 18,
      source: 'manual_input',
      status: 'event_extracted',
      createdAt: now,
      updatedAt: now,
    },
  ])

  await db.insert(novelEvents).values([
    {
      id: 'event-1',
      projectId: 'project-1',
      chapterId: 'chapter-1',
      eventNo: 1,
      eventType: 'revelation',
      summary: '林晚发现未婚夫和姐姐正在密谋夺走公司。',
      detail: '林晚回到宴会厅后听见两人密谋，意识到自己遭到亲近之人的背叛。',
      charactersJson: JSON.stringify(['林晚', '未婚夫', '姐姐']),
      location: '宴会厅',
      timeHint: '宴会期间',
      emotionTone: '震惊、压抑',
      conflictLevel: 'high',
      importance: 'critical',
      sourceTextRangeJson: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'event-2',
      projectId: 'project-1',
      chapterId: 'chapter-1',
      eventNo: 2,
      eventType: 'action',
      summary: '林晚决定当众揭穿阴谋。',
      detail: '她压下怒火，选择在公众场合反击。',
      charactersJson: JSON.stringify(['林晚']),
      location: '宴会厅',
      timeHint: '随后',
      emotionTone: '克制、决绝',
      conflictLevel: 'medium',
      importance: 'major',
      sourceTextRangeJson: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'event-3',
      projectId: 'project-1',
      chapterId: 'chapter-2',
      eventNo: 1,
      eventType: 'conflict',
      summary: '林晚拿出关键证据反击。',
      detail: '她在众人面前展示证据，让对手陷入被动。',
      charactersJson: JSON.stringify(['林晚', '未婚夫', '姐姐']),
      location: '宴会厅',
      timeHint: '下一幕',
      emotionTone: '紧张、爆发',
      conflictLevel: 'high',
      importance: 'critical',
      sourceTextRangeJson: null,
      createdAt: now,
      updatedAt: now,
    },
  ])

  return createPlannerInput()
}

function createPlannerInput(): EpisodePlannerInput {
  const novelEvents: EpisodePlannerSourceEvent[] = [
    {
      id: 'event-1',
      projectId: 'project-1',
      chapterId: 'chapter-1',
      chapterNo: 1,
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
    },
    {
      id: 'event-2',
      projectId: 'project-1',
      chapterId: 'chapter-1',
      chapterNo: 1,
      eventNo: 2,
      eventType: 'action',
      summary: '林晚决定当众揭穿阴谋。',
      detail: '她压下怒火，选择在公众场合反击。',
      characters: ['林晚'],
      location: '宴会厅',
      timeHint: '随后',
      emotionTone: '克制、决绝',
      conflictLevel: 'medium',
      importance: 'major',
    },
    {
      id: 'event-3',
      projectId: 'project-1',
      chapterId: 'chapter-2',
      chapterNo: 2,
      eventNo: 1,
      eventType: 'conflict',
      summary: '林晚拿出关键证据反击。',
      detail: '她在众人面前展示证据，让对手陷入被动。',
      characters: ['林晚', '未婚夫', '姐姐'],
      location: '宴会厅',
      timeHint: '下一幕',
      emotionTone: '紧张、爆发',
      conflictLevel: 'high',
      importance: 'critical',
    },
  ]

  return {
    projectId: 'project-1',
    chapterIds: ['chapter-1', 'chapter-2'],
    novelEvents,
    styleConfig: {
      title: '重生短剧测试',
      genre: 'revenge',
      targetPlatform: 'douyin',
      visualStyle: 'realistic',
      episodeDuration: 60,
    },
  }
}

describe('EpisodePlannerAgent', () => {
  it('plans episodes, writes episode links, and completes run/task records', async () => {
    const db = await createTestDb()
    const input = await seedEvents(db)

    const provider = new MockStructuredTextProvider(() => ({
      episodes: [
        {
          title: '第1集：宴会背叛',
          summary: '林晚发现背叛并决定当众反击。',
          opening_hook: '林晚回到宴会厅时听见熟悉的声音在密谋。',
          ending_hook: '她抬头看向众人，准备撕开真相。',
          source_event_links: [
            { novel_event_id: 'event-1', order_in_episode: 1, usage_type: 'setup' },
            { novel_event_id: 'event-2', order_in_episode: 2, usage_type: 'primary' },
          ],
        },
        {
          title: '第2集：证据反击',
          summary: '林晚拿出证据让对手陷入被动。',
          opening_hook: '所有人的目光都落在林晚手中的证据上。',
          ending_hook: '真正的幕后黑手即将浮出水面。',
          source_event_links: [
            { novel_event_id: 'event-3', order_in_episode: 1, usage_type: 'payoff' },
          ],
        },
      ],
    }))

    const result = await runEpisodePlannerAgent({ db, provider, input })

    expect(result.success).toBe(true)

    const plannedEpisodes = await db.select().from(episodes).where(eq(episodes.projectId, 'project-1'))
    expect(plannedEpisodes).toHaveLength(2)
    expect(plannedEpisodes[0].episodeNo).toBe(1)
    expect(plannedEpisodes[0].openingHook).toContain('宴会厅')
    expect(plannedEpisodes[1].endingHook).toContain('幕后黑手')
    expect(plannedEpisodes[0].status).toBe('planned')

    const links = await db
      .select()
      .from(episodeEventLinks)
      .where(eq(episodeEventLinks.projectId, 'project-1'))
      .orderBy(episodeEventLinks.orderInEpisode)
    expect(links).toHaveLength(3)
    expect(links.map((link) => link.novelEventId).sort()).toEqual(['event-1', 'event-2', 'event-3'])
    expect(links[0].usageType).toBe('setup')

    const [run] = await db.select().from(agentRuns).limit(1)
    expect(run.status).toBe('completed')
    expect(run.agentType).toBe('EpisodePlannerAgent')

    const [task] = await db.select().from(generationTasks).limit(1)
    expect(task.status).toBe('completed')
    expect(task.taskType).toBe('episode_planning')
  })

  it('marks run and task failed when the provider throws', async () => {
    const db = await createTestDb()
    const input = await seedEvents(db)

    const provider: StructuredTextProvider = {
      name: 'mock',
      model: 'throwing-model',
      async generateStructuredJson() {
        throw new Error('provider unavailable')
      },
    }

    const result = await runEpisodePlannerAgent({ db, provider, input })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('provider unavailable')
    }

    const plannedEpisodes = await db.select().from(episodes).where(eq(episodes.projectId, 'project-1'))
    expect(plannedEpisodes).toHaveLength(0)

    const links = await db.select().from(episodeEventLinks).where(eq(episodeEventLinks.projectId, 'project-1'))
    expect(links).toHaveLength(0)

    const [run] = await db.select().from(agentRuns).limit(1)
    expect(run.status).toBe('failed')

    const [task] = await db.select().from(generationTasks).limit(1)
    expect(task.status).toBe('failed')
  })

  it('fails when provider output references an unknown novel event', async () => {
    const db = await createTestDb()
    const input = await seedEvents(db)

    const provider = new MockStructuredTextProvider(() => ({
      episodes: [
        {
          title: 'Invalid episode',
          summary: 'This output references a missing event.',
          opening_hook: 'Missing event starts the episode.',
          ending_hook: 'The invalid link is rejected.',
          source_event_links: [
            { novel_event_id: 'event-1', order_in_episode: 1, usage_type: 'primary' },
            { novel_event_id: 'missing-event', order_in_episode: 2, usage_type: 'supporting' },
          ],
        },
      ],
    }))

    const result = await runEpisodePlannerAgent({ db, provider, input })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('unknown novel_event_id')
    }

    const plannedEpisodes = await db.select().from(episodes).where(eq(episodes.projectId, 'project-1'))
    expect(plannedEpisodes).toHaveLength(0)
  })

  it('fails when provider output omits or duplicates source event coverage', async () => {
    const db = await createTestDb()
    const input = await seedEvents(db)

    const provider = new MockStructuredTextProvider(() => ({
      episodes: [
        {
          title: 'Duplicate coverage',
          summary: 'This output links one source event twice.',
          opening_hook: 'The duplicate starts here.',
          ending_hook: 'The duplicate is rejected.',
          source_event_links: [
            { novel_event_id: 'event-1', order_in_episode: 1, usage_type: 'primary' },
            { novel_event_id: 'event-1', order_in_episode: 2, usage_type: 'supporting' },
          ],
        },
      ],
    }))

    const result = await runEpisodePlannerAgent({ db, provider, input })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('more than once')
    }

    const plannedEpisodes = await db.select().from(episodes).where(eq(episodes.projectId, 'project-1'))
    expect(plannedEpisodes).toHaveLength(0)
  })

  it('fails when source event order is not consecutive within an episode', async () => {
    const db = await createTestDb()
    const input = await seedEvents(db)

    const provider = new MockStructuredTextProvider(() => ({
      episodes: [
        {
          title: 'Invalid order',
          summary: 'This output skips an order number.',
          opening_hook: 'The sequence starts incorrectly.',
          ending_hook: 'The invalid sequence is rejected.',
          source_event_links: [
            { novel_event_id: 'event-1', order_in_episode: 1, usage_type: 'setup' },
            { novel_event_id: 'event-2', order_in_episode: 3, usage_type: 'primary' },
            { novel_event_id: 'event-3', order_in_episode: 4, usage_type: 'payoff' },
          ],
        },
      ],
    }))

    const result = await runEpisodePlannerAgent({ db, provider, input })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('ordered consecutively')
    }

    const plannedEpisodes = await db.select().from(episodes).where(eq(episodes.projectId, 'project-1'))
    expect(plannedEpisodes).toHaveLength(0)
  })

  it('rejects planning when the project already has episodes', async () => {
    const db = await createTestDb()
    const input = await seedEvents(db)
    const now = new Date().toISOString()

    await db.insert(episodes).values({
      id: 'existing-episode',
      projectId: 'project-1',
      episodeNo: 1,
      title: 'Existing episode',
      summary: 'Already planned.',
      openingHook: 'Existing opening.',
      endingHook: 'Existing ending.',
      scriptId: null,
      videoUrl: null,
      status: 'planned',
      createdAt: now,
      updatedAt: now,
    })

    const provider = new MockStructuredTextProvider(() => ({
      episodes: [
        {
          title: 'Should not be used',
          summary: 'Existing episodes should block planning.',
          opening_hook: 'Blocked.',
          ending_hook: 'Blocked.',
          source_event_links: [
            { novel_event_id: 'event-1', order_in_episode: 1, usage_type: 'primary' },
            { novel_event_id: 'event-2', order_in_episode: 2, usage_type: 'primary' },
            { novel_event_id: 'event-3', order_in_episode: 3, usage_type: 'primary' },
          ],
        },
      ],
    }))

    const result = await runEpisodePlannerAgent({ db, provider, input })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('already has episodes')
    }

    const plannedEpisodes = await db.select().from(episodes).where(eq(episodes.projectId, 'project-1'))
    expect(plannedEpisodes).toHaveLength(1)

    const links = await db.select().from(episodeEventLinks).where(eq(episodeEventLinks.projectId, 'project-1'))
    expect(links).toHaveLength(0)
  })
})
