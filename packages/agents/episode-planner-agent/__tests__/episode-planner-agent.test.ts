import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { createDatabase, initializeDatabase, type DatabaseClient } from '../../../database/index.js'
import {
  agentRuns,
  assets,
  batches,
  characters,
  episodeEventLinks,
  episodes,
  generationTasks,
  novelChapters,
  novelEvents,
  projects,
  scripts,
  storyboards,
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

  await db.insert(batches).values({
    id: 'batch-1',
    projectId: 'project-1',
    batchNo: 1,
    chapterStartNo: 1,
    chapterEndNo: 2,
    episodeStartNo: 1,
    episodeEndNo: 0,
    status: 'planned',
    createdAt: now,
    updatedAt: now,
  })

  return createPlannerInput()
}

function createPlannerInput(
  overrides: Partial<EpisodePlannerInput> = {},
): EpisodePlannerInput {
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
    batchId: 'batch-1',
    mode: 'create',
    episodeStartNo: 1,
    chapterIds: ['chapter-1', 'chapter-2'],
    novelEvents,
    styleConfig: {
      title: '重生短剧测试',
      genre: 'revenge',
      targetPlatform: 'douyin',
      visualStyle: 'realistic',
      episodeDuration: 60,
    },
    ...overrides,
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
    // Episodes are stamped with the batch and the batch's episode range is finalized.
    expect(plannedEpisodes.every((ep) => ep.batchId === 'batch-1')).toBe(true)
    const [batchAfter] = await db.select().from(batches).where(eq(batches.id, 'batch-1'))
    expect(batchAfter.episodeStartNo).toBe(1)
    expect(batchAfter.episodeEndNo).toBe(2)
    expect(batchAfter.status).toBe('planned')

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

  it('re-plans a batch, growing episode count and renumbering the following batch', async () => {
    const db = await createTestDb()
    const input = await seedEvents(db)
    const now = new Date().toISOString()

    // Plan batch 1 into 2 episodes (eps 1-2).
    await runEpisodePlannerAgent({ db, provider: twoEpisodeProvider(), input })

    // A following batch 2 already occupies episodes 3-4.
    await seedFollowingBatch(db, now, { batchNo: 2, episodeStartNo: 3, episodeEndNo: 4 })

    // Re-plan batch 1 into 3 episodes (delta = +1). Following batch must renumber to 4-5.
    const replanInput = createPlannerInput({ mode: 'replan', batchId: 'batch-1', episodeStartNo: 1 })
    const result = await runEpisodePlannerAgent({ db, provider: threeEpisodeProvider(), input: replanInput })
    expect(result.success).toBe(true)

    const batch1Eps = await db
      .select()
      .from(episodes)
      .where(eq(episodes.batchId, 'batch-1'))
      .orderBy(episodes.episodeNo)
    expect(batch1Eps.map((e) => e.episodeNo)).toEqual([1, 2, 3])

    const batch2Eps = await db
      .select()
      .from(episodes)
      .where(eq(episodes.batchId, 'batch-2'))
      .orderBy(episodes.episodeNo)
    expect(batch2Eps.map((e) => e.episodeNo)).toEqual([4, 5])

    // Global sequence is contiguous 1..5 with no UNIQUE collision.
    const allEps = await db
      .select()
      .from(episodes)
      .where(eq(episodes.projectId, 'project-1'))
      .orderBy(episodes.episodeNo)
    expect(allEps.map((e) => e.episodeNo)).toEqual([1, 2, 3, 4, 5])

    const [batch1] = await db.select().from(batches).where(eq(batches.id, 'batch-1'))
    expect(batch1.episodeEndNo).toBe(3)
    const [batch2] = await db.select().from(batches).where(eq(batches.id, 'batch-2'))
    expect([batch2.episodeStartNo, batch2.episodeEndNo]).toEqual([4, 5])
  })

  it('re-plans a batch, shrinking episode count and renumbering the following batch', async () => {
    const db = await createTestDb()
    const input = await seedEvents(db)
    const now = new Date().toISOString()

    // Plan batch 1 into 3 episodes (eps 1-3), following batch 2 at 4-5.
    await runEpisodePlannerAgent({ db, provider: threeEpisodeProvider(), input })
    await db.update(batches).set({ episodeEndNo: 3 }).where(eq(batches.id, 'batch-1'))
    await seedFollowingBatch(db, now, { batchNo: 2, episodeStartNo: 4, episodeEndNo: 5 })

    // Re-plan batch 1 into 2 episodes (delta = -1). Following batch renumbers to 3-4.
    const replanInput = createPlannerInput({ mode: 'replan', batchId: 'batch-1', episodeStartNo: 1 })
    const result = await runEpisodePlannerAgent({ db, provider: twoEpisodeProvider(), input: replanInput })
    expect(result.success).toBe(true)

    const allEps = await db
      .select()
      .from(episodes)
      .where(eq(episodes.projectId, 'project-1'))
      .orderBy(episodes.episodeNo)
    expect(allEps.map((e) => e.episodeNo)).toEqual([1, 2, 3, 4])

    const batch2Eps = await db
      .select()
      .from(episodes)
      .where(eq(episodes.batchId, 'batch-2'))
      .orderBy(episodes.episodeNo)
    expect(batch2Eps.map((e) => e.episodeNo)).toEqual([3, 4])
  })

  it('scoped re-plan deletes the batch orchestration but preserves the project asset library', async () => {
    const db = await createTestDb()
    const input = await seedEvents(db)
    const now = new Date().toISOString()

    await runEpisodePlannerAgent({ db, provider: twoEpisodeProvider(), input })
    const [firstEpisode] = await db
      .select()
      .from(episodes)
      .where(eq(episodes.batchId, 'batch-1'))
      .orderBy(episodes.episodeNo)

    // Downstream: a script + storyboard for the batch's episode, a first-frame image
    // for the storyboard, plus a project-level character and its reference image.
    await db.insert(scripts).values({
      id: 'script-1',
      projectId: 'project-1',
      episodeId: firstEpisode.id,
      title: 'S1',
      summary: 'sum',
      content: 'body',
      structuredJson: '{}',
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    })
    await db.insert(storyboards).values({
      id: 'sb-1',
      projectId: 'project-1',
      episodeId: firstEpisode.id,
      shotNo: 1,
      duration: 3,
      shotType: 'medium',
      action: 'action',
      imagePrompt: 'p',
      videoPrompt: 'v',
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    })
    await db.insert(assets).values([
      {
        id: 'asset-sb',
        projectId: 'project-1',
        assetType: 'storyboard_first_frame',
        targetType: 'storyboard_first_frame',
        targetId: 'sb-1',
        url: '/static/sb-1.png',
        metadataJson: '{}',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'asset-char',
        projectId: 'project-1',
        assetType: 'character_reference_image',
        targetType: 'character_reference_image',
        targetId: 'char-1',
        url: '/static/char-1.png',
        metadataJson: '{}',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
    ])
    await db.insert(characters).values({
      id: 'char-1',
      projectId: 'project-1',
      name: '林晚',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })

    const replanInput = createPlannerInput({ mode: 'replan', batchId: 'batch-1', episodeStartNo: 1 })
    const result = await runEpisodePlannerAgent({ db, provider: twoEpisodeProvider(), input: replanInput })
    expect(result.success).toBe(true)

    // Old orchestration is gone.
    expect(await db.select().from(scripts).where(eq(scripts.id, 'script-1'))).toHaveLength(0)
    expect(await db.select().from(storyboards).where(eq(storyboards.id, 'sb-1'))).toHaveLength(0)
    expect(await db.select().from(assets).where(eq(assets.id, 'asset-sb'))).toHaveLength(0)

    // Project asset library survives.
    expect(await db.select().from(characters).where(eq(characters.id, 'char-1'))).toHaveLength(1)
    expect(await db.select().from(assets).where(eq(assets.id, 'asset-char'))).toHaveLength(1)

    // Fresh episodes were inserted for the batch.
    const batch1Eps = await db.select().from(episodes).where(eq(episodes.batchId, 'batch-1'))
    expect(batch1Eps).toHaveLength(2)
  })
})

function twoEpisodeProvider() {
  return new MockStructuredTextProvider(() => ({
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
        source_event_links: [{ novel_event_id: 'event-3', order_in_episode: 1, usage_type: 'payoff' }],
      },
    ],
  }))
}

function threeEpisodeProvider() {
  return new MockStructuredTextProvider(() => ({
    episodes: [
      {
        title: '第1集',
        summary: 's1',
        opening_hook: 'o1',
        ending_hook: 'e1',
        source_event_links: [{ novel_event_id: 'event-1', order_in_episode: 1, usage_type: 'setup' }],
      },
      {
        title: '第2集',
        summary: 's2',
        opening_hook: 'o2',
        ending_hook: 'e2',
        source_event_links: [{ novel_event_id: 'event-2', order_in_episode: 1, usage_type: 'primary' }],
      },
      {
        title: '第3集',
        summary: 's3',
        opening_hook: 'o3',
        ending_hook: 'e3',
        source_event_links: [{ novel_event_id: 'event-3', order_in_episode: 1, usage_type: 'payoff' }],
      },
    ],
  }))
}

/** Insert a following batch plus placeholder episodes occupying [episodeStartNo, episodeEndNo]. */
async function seedFollowingBatch(
  db: DatabaseClient,
  now: string,
  { batchNo, episodeStartNo, episodeEndNo }: { batchNo: number; episodeStartNo: number; episodeEndNo: number },
) {
  const batchId = `batch-${batchNo}`
  await db.insert(batches).values({
    id: batchId,
    projectId: 'project-1',
    batchNo,
    chapterStartNo: episodeStartNo,
    chapterEndNo: episodeEndNo,
    episodeStartNo,
    episodeEndNo,
    status: 'planned',
    createdAt: now,
    updatedAt: now,
  })

  const rows = []
  for (let no = episodeStartNo; no <= episodeEndNo; no += 1) {
    rows.push({
      id: `${batchId}-ep-${no}`,
      projectId: 'project-1',
      batchId,
      episodeNo: no,
      title: `E${no}`,
      summary: 's',
      openingHook: 'o',
      endingHook: 'e',
      scriptId: null,
      videoUrl: null,
      status: 'planned',
      createdAt: now,
      updatedAt: now,
    })
  }
  await db.insert(episodes).values(rows)
}
