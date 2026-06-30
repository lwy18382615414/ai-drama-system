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
} from '../../../database/index.js'
import { MockStructuredTextProvider } from '../../../providers/index.js'
import { runExtractAgent } from '../service.js'
import type { ExtractAgentInput, ExtractAgentOutput } from '../schema.js'

async function createTestDb() {
  const db = await createDatabase(':memory:')
  initializeDatabase(db)
  return db
}

async function seedExtractContext(db: DatabaseClient) {
  const now = new Date().toISOString()
  const scriptStructuredJson = createScriptStructuredJson()

  await db.insert(projects).values({
    id: 'project-1',
    title: '重生短剧测试',
    description: 'A local asset extraction project.',
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
    openingHook: '林晚推开宴会厅的门。',
    endingHook: '证据即将播放。',
    scriptId: 'script-1',
    videoUrl: null,
    status: 'script_ready',
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

  return createExtractInput(scriptStructuredJson)
}

function createExtractInput(scriptStructuredJson = createScriptStructuredJson()): ExtractAgentInput {
  return {
    projectId: 'project-1',
    episodeId: 'episode-1',
    episode: {
      id: 'episode-1',
      projectId: 'project-1',
      episodeNo: 1,
      title: '第1集：宴会背叛',
      summary: '林晚发现背叛并决定当众反击。',
      openingHook: '林晚推开宴会厅的门。',
      endingHook: '证据即将播放。',
      status: 'script_ready',
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
    projectStyle: {
      title: '重生短剧测试',
      genre: 'revenge',
      targetPlatform: 'douyin',
      visualStyle: 'realistic',
      episodeDuration: 60,
    },
    existingCharacters: [],
    existingScenes: [],
    existingProps: [],
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
        characters: ['林晚', '未婚夫', '姐姐'],
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

function createProviderOutput(): ExtractAgentOutput {
  return {
    characters: [
      {
        name: '林晚',
        alias_json: ['林小姐'],
        role: 'protagonist',
        age: '25',
        gender: 'female',
        appearance: '黑色礼服，神情克制。',
        personality: '冷静、决绝。',
        background: '公司继承人。',
        relationship_json: [{ target: '未婚夫', relation: 'betrayed_by' }],
        reference_image_url: null,
        voice_id: null,
        usage_type: 'protagonist',
      },
      {
        name: '未婚夫',
        alias_json: [],
        role: 'antagonist',
        age: null,
        gender: 'male',
        appearance: '西装革履但神色慌乱。',
        personality: '贪婪、虚伪。',
        background: null,
        relationship_json: [],
        reference_image_url: null,
        voice_id: null,
        usage_type: 'antagonist',
      },
    ],
    scenes: [
      {
        name: '宴会厅',
        description: '高端宴会现场，宾客聚集，适合公开对峙。',
        location_type: 'interior',
        visual_style: 'realistic',
        visual_prompt: 'realistic luxury banquet hall, tense atmosphere, dramatic lighting',
        reference_image_url: null,
        usage_type: 'primary_location',
      },
    ],
    props: [
      {
        name: '手机证据',
        description: '林晚用来播放录音证据的手机。',
        significance: '揭穿阴谋的关键道具。',
        visual_prompt: 'close-up of a smartphone showing an audio recording interface',
        reference_image_url: null,
        usage_type: 'key_prop',
      },
    ],
  }
}

function renderScriptContent(output: ReturnType<typeof createScriptStructuredJson>) {
  return output.script_sections.map((section) => `${section.location}: ${section.description}`).join('\n')
}

async function seedExistingAssets(db: DatabaseClient) {
  const now = new Date().toISOString()

  await db.insert(characters).values({
    id: 'character-existing',
    projectId: 'project-1',
    name: '林晚',
    aliasJson: '[]',
    role: 'heroine',
    age: null,
    gender: 'female',
    appearance: '已有外貌设定，不应被覆盖。',
    personality: null,
    background: null,
    relationshipJson: '[]',
    referenceImageUrl: null,
    voiceId: null,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  })

  await db.insert(scenes).values({
    id: 'scene-existing',
    projectId: 'project-1',
    name: '宴会厅',
    description: null,
    locationType: null,
    visualStyle: 'cinematic',
    visualPrompt: '已有场景提示词，不应被覆盖。',
    referenceImageUrl: null,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  })

  await db.insert(props).values({
    id: 'prop-existing',
    projectId: 'project-1',
    name: '手机证据',
    description: null,
    significance: '已有道具意义，不应被覆盖。',
    visualPrompt: null,
    referenceImageUrl: null,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  })
}

describe('ExtractAgent', () => {
  it('extracts assets, writes episode links, and completes run/task records', async () => {
    const db = await createTestDb()
    const input = await seedExtractContext(db)
    const provider = new MockStructuredTextProvider(() => createProviderOutput())

    const result = await runExtractAgent({ db, provider, input })

    expect(result.success).toBe(true)

    const characterRows = await db.select().from(characters).where(eq(characters.projectId, 'project-1'))
    expect(characterRows).toHaveLength(2)
    expect(characterRows.map((character) => character.name)).toContain('林晚')

    const sceneRows = await db.select().from(scenes).where(eq(scenes.projectId, 'project-1'))
    expect(sceneRows).toHaveLength(1)
    expect(sceneRows[0].name).toBe('宴会厅')

    const propRows = await db.select().from(props).where(eq(props.projectId, 'project-1'))
    expect(propRows).toHaveLength(1)
    expect(propRows[0].name).toBe('手机证据')

    const characterLinks = await db.select().from(episodeCharacterLinks).where(eq(episodeCharacterLinks.episodeId, 'episode-1'))
    const sceneLinks = await db.select().from(episodeSceneLinks).where(eq(episodeSceneLinks.episodeId, 'episode-1'))
    const propLinks = await db.select().from(episodePropLinks).where(eq(episodePropLinks.episodeId, 'episode-1'))
    expect(characterLinks).toHaveLength(2)
    expect(sceneLinks).toHaveLength(1)
    expect(propLinks).toHaveLength(1)

    const [episode] = await db.select().from(episodes).where(eq(episodes.id, 'episode-1')).limit(1)
    expect(episode.status).toBe('assets_ready')

    const [run] = await db.select().from(agentRuns).limit(1)
    expect(run.status).toBe('completed')
    expect(run.agentType).toBe('ExtractAgent')
    expect(run.episodeId).toBe('episode-1')

    const [task] = await db.select().from(generationTasks).limit(1)
    expect(task.status).toBe('completed')
    expect(task.taskType).toBe('asset_extraction')
    expect(task.episodeId).toBe('episode-1')
  })

  it('reuses same-name assets, preserves core settings, and fills missing fields', async () => {
    const db = await createTestDb()
    const input = await seedExtractContext(db)
    await seedExistingAssets(db)
    const provider = new MockStructuredTextProvider(() => createProviderOutput())

    const result = await runExtractAgent({ db, provider, input })

    expect(result.success).toBe(true)

    const characterRows = await db.select().from(characters).where(eq(characters.name, '林晚'))
    expect(characterRows).toHaveLength(1)
    expect(characterRows[0].id).toBe('character-existing')
    expect(characterRows[0].role).toBe('heroine')
    expect(characterRows[0].appearance).toBe('已有外貌设定，不应被覆盖。')
    expect(characterRows[0].personality).toBe('冷静、决绝。')
    expect(JSON.parse(characterRows[0].aliasJson)).toEqual(['林小姐'])

    const [scene] = await db.select().from(scenes).where(eq(scenes.id, 'scene-existing')).limit(1)
    expect(scene.description).toContain('高端宴会现场')
    expect(scene.visualStyle).toBe('cinematic')
    expect(scene.visualPrompt).toBe('已有场景提示词，不应被覆盖。')

    const [prop] = await db.select().from(props).where(eq(props.id, 'prop-existing')).limit(1)
    expect(prop.description).toContain('播放录音证据')
    expect(prop.significance).toBe('已有道具意义，不应被覆盖。')
    expect(prop.visualPrompt).toContain('smartphone')

    const [characterLink] = await db
      .select()
      .from(episodeCharacterLinks)
      .where(eq(episodeCharacterLinks.characterId, 'character-existing'))
      .limit(1)
    expect(characterLink.episodeId).toBe('episode-1')
  })

  it('clears only current episode links when force is true', async () => {
    const db = await createTestDb()
    const input = await seedExtractContext(db)
    await seedExistingAssets(db)
    const now = new Date().toISOString()

    await db.insert(episodeCharacterLinks).values({
      id: 'old-character-link',
      projectId: 'project-1',
      episodeId: 'episode-1',
      characterId: 'character-existing',
      usageType: 'old',
      createdAt: now,
      updatedAt: now,
    })
    await db.insert(episodeSceneLinks).values({
      id: 'old-scene-link',
      projectId: 'project-1',
      episodeId: 'episode-1',
      sceneId: 'scene-existing',
      usageType: 'old',
      createdAt: now,
      updatedAt: now,
    })
    await db.insert(episodePropLinks).values({
      id: 'old-prop-link',
      projectId: 'project-1',
      episodeId: 'episode-1',
      propId: 'prop-existing',
      usageType: 'old',
      createdAt: now,
      updatedAt: now,
    })

    const provider = new MockStructuredTextProvider(() => createProviderOutput())
    const result = await runExtractAgent({
      db,
      provider,
      input: {
        ...input,
        options: { force: true },
      },
    })

    expect(result.success).toBe(true)

    const oldCharacterLinks = await db
      .select()
      .from(episodeCharacterLinks)
      .where(eq(episodeCharacterLinks.id, 'old-character-link'))
    const oldSceneLinks = await db.select().from(episodeSceneLinks).where(eq(episodeSceneLinks.id, 'old-scene-link'))
    const oldPropLinks = await db.select().from(episodePropLinks).where(eq(episodePropLinks.id, 'old-prop-link'))
    expect(oldCharacterLinks).toHaveLength(0)
    expect(oldSceneLinks).toHaveLength(0)
    expect(oldPropLinks).toHaveLength(0)

    const [existingCharacter] = await db.select().from(characters).where(eq(characters.id, 'character-existing')).limit(1)
    const [existingScene] = await db.select().from(scenes).where(eq(scenes.id, 'scene-existing')).limit(1)
    const [existingProp] = await db.select().from(props).where(eq(props.id, 'prop-existing')).limit(1)
    expect(existingCharacter).toBeTruthy()
    expect(existingScene).toBeTruthy()
    expect(existingProp).toBeTruthy()

    const characterLinks = await db.select().from(episodeCharacterLinks).where(eq(episodeCharacterLinks.episodeId, 'episode-1'))
    expect(characterLinks).toHaveLength(2)
  })

  it('fails when episode links already exist and force is false', async () => {
    const db = await createTestDb()
    const input = await seedExtractContext(db)
    await seedExistingAssets(db)
    const now = new Date().toISOString()

    await db.insert(episodeCharacterLinks).values({
      id: 'old-character-link',
      projectId: 'project-1',
      episodeId: 'episode-1',
      characterId: 'character-existing',
      usageType: 'old',
      createdAt: now,
      updatedAt: now,
    })

    const provider = new MockStructuredTextProvider(() => createProviderOutput())
    const result = await runExtractAgent({ db, provider, input })

    expect(result.success).toBe(false)
    expect(result.success === false ? result.error : '').toContain('already has extracted assets')

    const characterLinks = await db.select().from(episodeCharacterLinks).where(eq(episodeCharacterLinks.episodeId, 'episode-1'))
    expect(characterLinks).toHaveLength(1)

    const [episode] = await db.select().from(episodes).where(eq(episodes.id, 'episode-1')).limit(1)
    expect(episode.status).toBe('script_ready')

    const [run] = await db.select().from(agentRuns).limit(1)
    expect(run.status).toBe('failed')

    const [task] = await db.select().from(generationTasks).limit(1)
    expect(task.status).toBe('failed')
  })

  it('marks run and task failed when provider output violates schema', async () => {
    const db = await createTestDb()
    const input = await seedExtractContext(db)
    const provider = new MockStructuredTextProvider(() => ({
      characters: [{ name: '' }],
      scenes: [],
      props: [],
    }))

    const result = await runExtractAgent({ db, provider, input })

    expect(result.success).toBe(false)

    const characterRows = await db.select().from(characters).where(eq(characters.projectId, 'project-1'))
    const sceneRows = await db.select().from(scenes).where(eq(scenes.projectId, 'project-1'))
    const propRows = await db.select().from(props).where(eq(props.projectId, 'project-1'))
    expect(characterRows).toHaveLength(0)
    expect(sceneRows).toHaveLength(0)
    expect(propRows).toHaveLength(0)

    const [episode] = await db.select().from(episodes).where(eq(episodes.id, 'episode-1')).limit(1)
    expect(episode.status).toBe('script_ready')

    const [run] = await db.select().from(agentRuns).limit(1)
    expect(run.status).toBe('failed')
    expect(run.errorMessage).toBeTruthy()

    const [task] = await db.select().from(generationTasks).limit(1)
    expect(task.status).toBe('failed')
  })

  it('rejects duplicate normalized names in one output category', async () => {
    const db = await createTestDb()
    const input = await seedExtractContext(db)
    const output = createProviderOutput()
    const provider = new MockStructuredTextProvider(() => ({
      ...output,
      characters: [output.characters[0], { ...output.characters[0], name: ' 林晚 ' }],
    }))

    const result = await runExtractAgent({ db, provider, input })

    expect(result.success).toBe(false)
    expect(result.success === false ? result.error : '').toContain('duplicate name')

    const characterRows = await db.select().from(characters).where(eq(characters.projectId, 'project-1'))
    expect(characterRows).toHaveLength(0)
  })
})
