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
  scripts,
} from '../../../database/index.js'
import { MockStructuredTextProvider } from '../../../providers/index.js'
import { runScriptAgent } from '../service.js'
import type { ScriptAgentInput } from '../schema.js'

async function createTestDb() {
  const db = await createDatabase(':memory:')
  await initializeDatabase(db)
  return db
}

async function seedScriptContext(db: DatabaseClient) {
  const now = new Date().toISOString()

  await db.insert(projects).values({
    id: 'project-1',
    title: '重生短剧测试',
    description: 'A local script generation project.',
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
    content: '林晚回到宴会厅，发现未婚夫和姐姐密谋夺走公司。',
    wordCount: 24,
    source: 'manual_input',
    status: 'event_extracted',
    createdAt: now,
    updatedAt: now,
  })

  await db.insert(episodes).values({
    id: 'episode-1',
    projectId: 'project-1',
    episodeNo: 1,
    title: '第1集：宴会背叛',
    summary: '林晚发现背叛并决定当众反击。',
    openingHook: '林晚回到宴会厅时听见熟悉的声音在密谋。',
    endingHook: '她抬头看向众人，准备撕开真相。',
    scriptId: null,
    videoUrl: null,
    status: 'planned',
    createdAt: now,
    updatedAt: now,
  })

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
  ])

  await db.insert(episodeEventLinks).values([
    {
      id: 'link-1',
      projectId: 'project-1',
      episodeId: 'episode-1',
      novelEventId: 'event-1',
      orderInEpisode: 1,
      usageType: 'setup',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'link-2',
      projectId: 'project-1',
      episodeId: 'episode-1',
      novelEventId: 'event-2',
      orderInEpisode: 2,
      usageType: 'primary',
      createdAt: now,
      updatedAt: now,
    },
  ])

  return createScriptInput()
}

function createScriptInput(): ScriptAgentInput {
  return {
    projectId: 'project-1',
    episodeId: 'episode-1',
    episode: {
      id: 'episode-1',
      projectId: 'project-1',
      episodeNo: 1,
      title: '第1集：宴会背叛',
      summary: '林晚发现背叛并决定当众反击。',
      openingHook: '林晚回到宴会厅时听见熟悉的声音在密谋。',
      endingHook: '她抬头看向众人，准备撕开真相。',
      status: 'planned',
    },
    episodeEventLinks: [
      {
        id: 'link-1',
        projectId: 'project-1',
        episodeId: 'episode-1',
        novelEventId: 'event-1',
        orderInEpisode: 1,
        usageType: 'setup',
      },
      {
        id: 'link-2',
        projectId: 'project-1',
        episodeId: 'episode-1',
        novelEventId: 'event-2',
        orderInEpisode: 2,
        usageType: 'primary',
      },
    ],
    linkedNovelEvents: [
      {
        id: 'event-1',
        projectId: 'project-1',
        chapterId: 'chapter-1',
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
    ],
    styleConfig: {
      title: '重生短剧测试',
      genre: 'revenge',
      targetPlatform: 'douyin',
      visualStyle: 'realistic',
      episodeDuration: 60,
    },
  }
}

function createProviderOutput(title = '第1集：宴会反击') {
  return {
    title,
    summary: '林晚发现背叛后，以克制姿态展开当众反击。',
    duration_seconds: 60,
    opening_hook: '林晚推开宴会厅的门，听见最熟悉的人正商量夺走她的一切。',
    ending_hook: '她举起手机看向全场，真正的证据即将播放。',
    script_sections: [
      {
        section_no: 1,
        type: 'opening',
        location: '宴会厅门口',
        characters: ['林晚'],
        description: '林晚停在门外，听见未婚夫和姐姐的低声密谋。',
        dialogues: [],
        narration: '背叛不是突然发生的，只是她今天才亲耳听见。',
        emotion: '震惊、压抑',
      },
      {
        section_no: 2,
        type: 'dialogue',
        location: '宴会厅',
        characters: ['林晚', '未婚夫', '姐姐'],
        description: '林晚走入众人视线，逼迫对方正面回应。',
        dialogues: [
          { character: '林晚', line: '你们刚才说的公司，是我的公司吗？', emotion: '克制' },
          { character: '未婚夫', line: '你听错了。', emotion: '慌乱' },
        ],
        narration: null,
        emotion: '紧张',
      },
      {
        section_no: 3,
        type: 'ending',
        location: '宴会厅中央',
        characters: ['林晚'],
        description: '林晚拿出手机，准备播放关键证据。',
        dialogues: [{ character: '林晚', line: '那就让所有人一起听清楚。', emotion: '决绝' }],
        narration: null,
        emotion: '爆发前夕',
      },
    ],
  }
}

async function seedExistingScript(db: DatabaseClient, title = '旧剧本') {
  const now = new Date().toISOString()

  await db.insert(scripts).values({
    id: 'script-existing',
    projectId: 'project-1',
    episodeId: 'episode-1',
    title,
    summary: '旧摘要',
    openingHook: '旧开场',
    endingHook: '旧结尾',
    content: '旧正文',
    structuredJson: JSON.stringify(createProviderOutput(title)),
    status: 'ready',
    createdAt: now,
    updatedAt: now,
  })

  await db
    .update(episodes)
    .set({ scriptId: 'script-existing', status: 'script_ready', updatedAt: now })
    .where(eq(episodes.id, 'episode-1'))
}

describe('ScriptAgent', () => {
  it('generates a script, updates the episode, and completes run/task records', async () => {
    const db = await createTestDb()
    const input = await seedScriptContext(db)
    const provider = new MockStructuredTextProvider(() => createProviderOutput())

    const result = await runScriptAgent({ db, provider, input })

    expect(result.success).toBe(true)

    const scriptRows = await db.select().from(scripts).where(eq(scripts.episodeId, 'episode-1'))
    expect(scriptRows).toHaveLength(1)
    expect(scriptRows[0].title).toBe('第1集：宴会反击')
    expect(scriptRows[0].content).toContain('林晚推开宴会厅')

    const structuredJson = JSON.parse(scriptRows[0].structuredJson) as { script_sections: unknown[] }
    expect(structuredJson.script_sections).toHaveLength(3)

    const [episode] = await db.select().from(episodes).where(eq(episodes.id, 'episode-1')).limit(1)
    expect(episode.status).toBe('script_ready')
    expect(episode.scriptId).toBe(scriptRows[0].id)
    expect(episode.openingHook).toContain('推开宴会厅')

    const [run] = await db.select().from(agentRuns).limit(1)
    expect(run.status).toBe('completed')
    expect(run.agentType).toBe('ScriptAgent')
    expect(run.episodeId).toBe('episode-1')

    const [task] = await db.select().from(generationTasks).limit(1)
    expect(task.status).toBe('completed')
    expect(task.taskType).toBe('script_generation')
    expect(task.episodeId).toBe('episode-1')
  })

  it('does not overwrite an existing script unless force is true', async () => {
    const db = await createTestDb()
    const input = await seedScriptContext(db)
    await seedExistingScript(db)

    const provider = new MockStructuredTextProvider(() => createProviderOutput('新剧本'))
    const result = await runScriptAgent({ db, provider, input })

    expect(result.success).toBe(false)
    expect(result.success === false ? result.error : '').toContain('already has script')

    const scriptRows = await db.select().from(scripts).where(eq(scripts.episodeId, 'episode-1'))
    expect(scriptRows).toHaveLength(1)
    expect(scriptRows[0].title).toBe('旧剧本')
    expect(scriptRows[0].content).toBe('旧正文')

    const [run] = await db.select().from(agentRuns).limit(1)
    expect(run.status).toBe('failed')

    const [task] = await db.select().from(generationTasks).limit(1)
    expect(task.status).toBe('failed')
  })

  it('updates the existing script when force is true', async () => {
    const db = await createTestDb()
    const input = await seedScriptContext(db)
    await seedExistingScript(db)

    const provider = new MockStructuredTextProvider(() => createProviderOutput('强制重写剧本'))
    const result = await runScriptAgent({
      db,
      provider,
      input: {
        ...input,
        options: { force: true },
      },
    })

    expect(result.success).toBe(true)
    expect(result.success ? result.scriptId : '').toBe('script-existing')

    const scriptRows = await db.select().from(scripts).where(eq(scripts.episodeId, 'episode-1'))
    expect(scriptRows).toHaveLength(1)
    expect(scriptRows[0].id).toBe('script-existing')
    expect(scriptRows[0].title).toBe('强制重写剧本')
    expect(scriptRows[0].content).toContain('林晚推开宴会厅')

    const [episode] = await db.select().from(episodes).where(eq(episodes.id, 'episode-1')).limit(1)
    expect(episode.scriptId).toBe('script-existing')
    expect(episode.status).toBe('script_ready')

    const [run] = await db.select().from(agentRuns).limit(1)
    expect(run.status).toBe('completed')

    const [task] = await db.select().from(generationTasks).limit(1)
    expect(task.status).toBe('completed')
  })

  it('marks run and task failed when script section order is invalid', async () => {
    const db = await createTestDb()
    const input = await seedScriptContext(db)
    const provider = new MockStructuredTextProvider(() => ({
      ...createProviderOutput(),
      script_sections: [
        {
          section_no: 2,
          type: 'opening',
          location: '宴会厅',
          characters: ['林晚'],
          description: '段落编号不是从 1 连续开始。',
          dialogues: [],
          narration: null,
          emotion: '紧张',
        },
      ],
    }))

    const result = await runScriptAgent({ db, provider, input })

    expect(result.success).toBe(false)
    expect(result.success === false ? result.error : '').toContain('consecutively')

    const scriptRows = await db.select().from(scripts).where(eq(scripts.episodeId, 'episode-1'))
    expect(scriptRows).toHaveLength(0)

    const [run] = await db.select().from(agentRuns).limit(1)
    expect(run.status).toBe('failed')

    const [task] = await db.select().from(generationTasks).limit(1)
    expect(task.status).toBe('failed')
  })

  it('marks run and task failed when the episode has no linked events', async () => {
    const db = await createTestDb()
    const now = new Date().toISOString()

    await db.insert(projects).values({
      id: 'project-1',
      title: '重生短剧测试',
      description: null,
      genre: 'revenge',
      targetPlatform: 'douyin',
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
      title: '第1集',
      summary: '无事件测试',
      openingHook: '开场',
      endingHook: '结尾',
      scriptId: null,
      videoUrl: null,
      status: 'planned',
      createdAt: now,
      updatedAt: now,
    })

    const provider = new MockStructuredTextProvider(() => createProviderOutput())
    const result = await runScriptAgent({
      db,
      provider,
      input: {
        ...createScriptInput(),
        episodeEventLinks: [
          {
            id: 'missing-link',
            projectId: 'project-1',
            episodeId: 'episode-1',
            novelEventId: 'missing-event',
            orderInEpisode: 1,
            usageType: 'primary',
          },
        ],
        linkedNovelEvents: [
          {
            id: 'missing-event',
            projectId: 'project-1',
            chapterId: 'chapter-1',
            eventNo: 1,
            eventType: 'setup',
            summary: '不存在的事件',
            detail: '输入中存在，但数据库没有链接。',
            characters: [],
            location: null,
            timeHint: null,
            emotionTone: null,
            conflictLevel: 'low',
            importance: 'minor',
          },
        ],
      },
    })

    expect(result.success).toBe(false)
    expect(result.success === false ? result.error : '').toContain('linked novel event')

    const [run] = await db.select().from(agentRuns).limit(1)
    expect(run.status).toBe('failed')

    const [task] = await db.select().from(generationTasks).limit(1)
    expect(task.status).toBe('failed')
  })
})
