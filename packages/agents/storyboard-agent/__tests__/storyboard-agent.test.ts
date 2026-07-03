import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { createDatabase, initializeDatabase, type DatabaseClient } from '../../../database/index.js'
import {
  agentRuns,
  characters,
  episodeCharacterLinks,
  episodePropLinks,
  episodeSceneLinks,
  episodes,
  generationTasks,
  projects,
  props,
  scenes,
  scripts,
  storyboards,
} from '../../../database/index.js'
import { MockStructuredTextProvider } from '../../../providers/index.js'
import { runStoryboardAgent } from '../service.js'
import type { StoryboardAgentInput, StoryboardAgentOutput } from '../schema.js'

async function createTestDb() {
  const db = await createDatabase(':memory:')
  await initializeDatabase(db)
  return db
}

async function seedStoryboardContext(db: DatabaseClient) {
  const now = new Date().toISOString()
  const scriptStructuredJson = createScriptStructuredJson()

  await db.insert(projects).values({
    id: 'project-1',
    title: '重生短剧测试',
    description: 'A local storyboard generation project.',
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
    title: '第1集：宴会背叛',
    summary: '林晚发现背叛并决定当众反击。',
    openingHook: scriptStructuredJson.opening_hook,
    endingHook: scriptStructuredJson.ending_hook,
    scriptId: 'script-1',
    videoUrl: null,
    status: 'assets_ready',
    createdAt: now,
    updatedAt: now,
  })

  await db.insert(scripts).values({
    id: 'script-1',
    projectId: 'project-1',
    episodeId: 'episode-1',
    title: scriptStructuredJson.title,
    summary: scriptStructuredJson.summary,
    openingHook: scriptStructuredJson.opening_hook,
    endingHook: scriptStructuredJson.ending_hook,
    content: renderScriptContent(scriptStructuredJson),
    structuredJson: JSON.stringify(scriptStructuredJson),
    status: 'ready',
    createdAt: now,
    updatedAt: now,
  })

  await db.insert(characters).values([
    {
      id: 'character-linwan',
      projectId: 'project-1',
      name: '林晚',
      aliasJson: JSON.stringify(['林小姐']),
      role: 'protagonist',
      age: '25',
      gender: 'female',
      appearance: '黑色礼服，神情克制。',
      personality: '冷静、决绝。',
      background: '公司继承人。',
      relationshipJson: '[]',
      referenceImageUrl: null,
      voiceId: null,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'character-fiance',
      projectId: 'project-1',
      name: '未婚夫',
      aliasJson: '[]',
      role: 'antagonist',
      age: null,
      gender: 'male',
      appearance: '西装革履但神色慌乱。',
      personality: '贪婪、虚伪。',
      background: null,
      relationshipJson: '[]',
      referenceImageUrl: null,
      voiceId: null,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    },
  ])

  await db.insert(scenes).values({
    id: 'scene-banquet',
    projectId: 'project-1',
    name: '宴会厅',
    description: '高端宴会现场，宾客聚集，适合公开对峙。',
    locationType: 'interior',
    visualStyle: 'realistic',
    visualPrompt: 'realistic luxury banquet hall, tense atmosphere, dramatic lighting',
    referenceImageUrl: null,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  })

  await db.insert(props).values({
    id: 'prop-phone',
    projectId: 'project-1',
    name: '手机证据',
    description: '林晚用来播放录音证据的手机。',
    significance: '揭穿阴谋的关键道具。',
    visualPrompt: 'close-up of a smartphone showing an audio recording interface',
    referenceImageUrl: null,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  })

  await db.insert(episodeCharacterLinks).values([
    {
      id: 'episode-character-1',
      projectId: 'project-1',
      episodeId: 'episode-1',
      characterId: 'character-linwan',
      usageType: 'protagonist',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'episode-character-2',
      projectId: 'project-1',
      episodeId: 'episode-1',
      characterId: 'character-fiance',
      usageType: 'antagonist',
      createdAt: now,
      updatedAt: now,
    },
  ])

  await db.insert(episodeSceneLinks).values({
    id: 'episode-scene-1',
    projectId: 'project-1',
    episodeId: 'episode-1',
    sceneId: 'scene-banquet',
    usageType: 'primary_location',
    createdAt: now,
    updatedAt: now,
  })

  await db.insert(episodePropLinks).values({
    id: 'episode-prop-1',
    projectId: 'project-1',
    episodeId: 'episode-1',
    propId: 'prop-phone',
    usageType: 'key_prop',
    createdAt: now,
    updatedAt: now,
  })

  return createStoryboardInput(scriptStructuredJson)
}

function createStoryboardInput(scriptStructuredJson = createScriptStructuredJson()): StoryboardAgentInput {
  return {
    projectId: 'project-1',
    episodeId: 'episode-1',
    episode: {
      id: 'episode-1',
      projectId: 'project-1',
      episodeNo: 1,
      title: '第1集：宴会背叛',
      summary: '林晚发现背叛并决定当众反击。',
      openingHook: scriptStructuredJson.opening_hook,
      endingHook: scriptStructuredJson.ending_hook,
      status: 'assets_ready',
    },
    script: {
      id: 'script-1',
      projectId: 'project-1',
      episodeId: 'episode-1',
      title: scriptStructuredJson.title,
      summary: scriptStructuredJson.summary,
      openingHook: scriptStructuredJson.opening_hook,
      endingHook: scriptStructuredJson.ending_hook,
      content: renderScriptContent(scriptStructuredJson),
      status: 'ready',
    },
    scriptStructuredJson,
    characters: [
      {
        id: 'character-linwan',
        projectId: 'project-1',
        name: '林晚',
        role: 'protagonist',
        appearance: '黑色礼服，神情克制。',
        status: 'active',
      },
      {
        id: 'character-fiance',
        projectId: 'project-1',
        name: '未婚夫',
        role: 'antagonist',
        appearance: '西装革履但神色慌乱。',
        status: 'active',
      },
    ],
    scenes: [
      {
        id: 'scene-banquet',
        projectId: 'project-1',
        name: '宴会厅',
        description: '高端宴会现场，宾客聚集，适合公开对峙。',
        locationType: 'interior',
        visualStyle: 'realistic',
        visualPrompt: 'realistic luxury banquet hall, tense atmosphere, dramatic lighting',
        status: 'active',
      },
    ],
    props: [
      {
        id: 'prop-phone',
        projectId: 'project-1',
        name: '手机证据',
        description: '林晚用来播放录音证据的手机。',
        significance: '揭穿阴谋的关键道具。',
        visualPrompt: 'close-up of a smartphone showing an audio recording interface',
        status: 'active',
      },
    ],
    projectStyle: {
      title: '重生短剧测试',
      genre: 'revenge',
      targetPlatform: 'douyin',
      visualStyle: 'realistic',
      episodeDuration: 60,
    },
  }
}

function createScriptStructuredJson() {
  return {
    title: '第1集：宴会反击',
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
        characters: ['林晚', '未婚夫'],
        description: '林晚走入众人视线，逼迫对方正面回应。',
        dialogues: [
          { character: '林晚', line: '你们刚才说的公司，是我的公司吗？', emotion: '克制' },
          { character: '未婚夫', line: '你听错了。', emotion: '慌乱' },
        ],
        narration: null,
        emotion: '紧张',
      },
    ],
  }
}

function createProviderOutput(): StoryboardAgentOutput {
  return {
    storyboards: [
      {
        shot_no: 1,
        duration: 6,
        scene_id: 'scene-banquet',
        character_ids: ['character-linwan'],
        prop_ids: [],
        script_section_no: 1,
        shot_type: 'medium',
        camera_angle: 'eye_level',
        camera_movement: 'slow_push_in',
        action: '林晚推开宴会厅大门，停在门口听见密谋。',
        dialogue: [],
        narration: '背叛不是突然发生的，只是她今天才亲耳听见。',
        emotion: '震惊、压抑',
        image_prompt: 'realistic cinematic medium shot, Lin Wan in black dress at luxury banquet hall doorway, tense lighting',
        video_prompt: 'slow push-in as Lin Wan opens the banquet hall door and freezes after hearing betrayal',
      },
      {
        shot_no: 2,
        duration: 8,
        scene_id: 'scene-banquet',
        character_ids: ['character-linwan', 'character-fiance'],
        prop_ids: ['prop-phone'],
        script_section_no: 2,
        shot_type: 'over_shoulder',
        camera_angle: 'eye_level',
        camera_movement: 'static',
        action: '林晚举起手机，逼迫未婚夫回应。',
        dialogue: [{ character: '林晚', line: '你们刚才说的公司，是我的公司吗？', emotion: '克制' }],
        narration: null,
        emotion: '紧张',
        image_prompt: 'over shoulder shot of heroine holding smartphone evidence in luxury banquet hall, antagonist nervous',
        video_prompt: 'static over-shoulder shot, heroine raises smartphone evidence, antagonist reacts nervously',
      },
    ],
  }
}

function renderScriptContent(output: ReturnType<typeof createScriptStructuredJson>) {
  return output.script_sections.map((section) => `${section.location}: ${section.description}`).join('\n')
}

async function seedExistingStoryboard(db: DatabaseClient, shotNo = 1) {
  const now = new Date().toISOString()

  await db.insert(storyboards).values({
    id: `storyboard-existing-${shotNo}`,
    projectId: 'project-1',
    episodeId: 'episode-1',
    shotNo,
    duration: 5,
    sceneId: 'scene-banquet',
    characterIdsJson: JSON.stringify(['character-linwan']),
    propIdsJson: '[]',
    scriptSectionNo: 1,
    shotType: 'medium',
    cameraAngle: 'eye_level',
    cameraMovement: 'static',
    action: '旧分镜动作',
    dialogueJson: '[]',
    narration: null,
    emotion: '旧情绪',
    imagePrompt: 'old image prompt',
    videoPrompt: 'old video prompt',
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
}

describe('StoryboardAgent', () => {
  it('generates storyboards, updates the episode, and completes run/task records', async () => {
    const db = await createTestDb()
    const input = await seedStoryboardContext(db)
    const provider = new MockStructuredTextProvider(() => createProviderOutput())

    const result = await runStoryboardAgent({ db, provider, input })

    expect(result.success).toBe(true)

    const storyboardRows = await db.select().from(storyboards).where(eq(storyboards.episodeId, 'episode-1'))
    expect(storyboardRows).toHaveLength(2)
    expect(storyboardRows[0].sceneId).toBe('scene-banquet')
    expect(JSON.parse(storyboardRows[1].propIdsJson)).toEqual(['prop-phone'])

    const [episode] = await db.select().from(episodes).where(eq(episodes.id, 'episode-1')).limit(1)
    expect(episode.status).toBe('storyboard_ready')

    const [run] = await db.select().from(agentRuns).limit(1)
    expect(run.status).toBe('completed')
    expect(run.agentType).toBe('StoryboardAgent')
    expect(run.episodeId).toBe('episode-1')

    const [task] = await db.select().from(generationTasks).limit(1)
    expect(task.status).toBe('completed')
    expect(task.taskType).toBe('storyboard_generation')
    expect(task.episodeId).toBe('episode-1')
  })

  it('does not overwrite existing storyboards unless force is true', async () => {
    const db = await createTestDb()
    const input = await seedStoryboardContext(db)
    await seedExistingStoryboard(db)
    const provider = new MockStructuredTextProvider(() => createProviderOutput())

    const result = await runStoryboardAgent({ db, provider, input })

    expect(result.success).toBe(false)
    expect(result.success === false ? result.error : '').toContain('already has storyboards')

    const storyboardRows = await db.select().from(storyboards).where(eq(storyboards.episodeId, 'episode-1'))
    expect(storyboardRows).toHaveLength(1)
    expect(storyboardRows[0].action).toBe('旧分镜动作')

    const [run] = await db.select().from(agentRuns).limit(1)
    expect(run.status).toBe('failed')

    const [task] = await db.select().from(generationTasks).limit(1)
    expect(task.status).toBe('failed')
  })

  it('deletes old storyboards and regenerates when force is true', async () => {
    const db = await createTestDb()
    const input = await seedStoryboardContext(db)
    await seedExistingStoryboard(db)
    const provider = new MockStructuredTextProvider(() => createProviderOutput())

    const result = await runStoryboardAgent({
      db,
      provider,
      input: {
        ...input,
        options: { force: true },
      },
    })

    expect(result.success).toBe(true)

    const oldRows = await db.select().from(storyboards).where(eq(storyboards.id, 'storyboard-existing-1'))
    expect(oldRows).toHaveLength(0)

    const storyboardRows = await db.select().from(storyboards).where(eq(storyboards.episodeId, 'episode-1'))
    expect(storyboardRows).toHaveLength(2)
    expect(storyboardRows.map((row) => row.shotNo)).toEqual([1, 2])
  })

  it('marks run and task failed when provider output references an unknown scene', async () => {
    const db = await createTestDb()
    const input = await seedStoryboardContext(db)
    const provider = new MockStructuredTextProvider(() => ({
      storyboards: [{ ...createProviderOutput().storyboards[0], scene_id: 'scene-missing' }],
    }))

    const result = await runStoryboardAgent({ db, provider, input })

    expect(result.success).toBe(false)
    expect(result.success === false ? result.error : '').toContain('unknown scene_id')

    const rows = await db.select().from(storyboards).where(eq(storyboards.episodeId, 'episode-1'))
    expect(rows).toHaveLength(0)

    const [run] = await db.select().from(agentRuns).limit(1)
    expect(run.status).toBe('failed')

    const [task] = await db.select().from(generationTasks).limit(1)
    expect(task.status).toBe('failed')
  })

  it('marks run and task failed when provider output references an unknown character', async () => {
    const db = await createTestDb()
    const input = await seedStoryboardContext(db)
    const provider = new MockStructuredTextProvider(() => ({
      storyboards: [{ ...createProviderOutput().storyboards[0], character_ids: ['character-missing'] }],
    }))

    const result = await runStoryboardAgent({ db, provider, input })

    expect(result.success).toBe(false)
    expect(result.success === false ? result.error : '').toContain('unknown character_id')

    const [run] = await db.select().from(agentRuns).limit(1)
    expect(run.status).toBe('failed')

    const [task] = await db.select().from(generationTasks).limit(1)
    expect(task.status).toBe('failed')
  })

  it('marks run and task failed when provider output references an unknown prop', async () => {
    const db = await createTestDb()
    const input = await seedStoryboardContext(db)
    const provider = new MockStructuredTextProvider(() => ({
      storyboards: [{ ...createProviderOutput().storyboards[0], prop_ids: ['prop-missing'] }],
    }))

    const result = await runStoryboardAgent({ db, provider, input })

    expect(result.success).toBe(false)
    expect(result.success === false ? result.error : '').toContain('unknown prop_id')

    const [run] = await db.select().from(agentRuns).limit(1)
    expect(run.status).toBe('failed')

    const [task] = await db.select().from(generationTasks).limit(1)
    expect(task.status).toBe('failed')
  })

  it('marks run and task failed when shot numbers are not consecutive', async () => {
    const db = await createTestDb()
    const input = await seedStoryboardContext(db)
    const output = createProviderOutput()
    const provider = new MockStructuredTextProvider(() => ({
      storyboards: [output.storyboards[0], { ...output.storyboards[1], shot_no: 3 }],
    }))

    const result = await runStoryboardAgent({ db, provider, input })

    expect(result.success).toBe(false)
    expect(result.success === false ? result.error : '').toContain('consecutively')

    const [run] = await db.select().from(agentRuns).limit(1)
    expect(run.status).toBe('failed')

    const [task] = await db.select().from(generationTasks).limit(1)
    expect(task.status).toBe('failed')
  })
})
