import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import {
  assets,
  characterAppearanceVersions,
  characters,
  createDatabase,
  episodes,
  generationTasks,
  initializeDatabase,
  projects,
  scripts,
  type DatabaseClient,
} from '../../packages/database/index.js'
import { MockImageProvider, MockStructuredTextProvider } from '../../packages/providers/index.js'
import { startTestWorker } from './test-helpers/task-worker.js'

const now = new Date().toISOString()

async function createTestDb() {
  const db = await createDatabase(':memory:')
  await initializeDatabase(db)
  return db
}

const scriptStructuredJson = {
  title: '第2集：疤痕',
  summary: '林晚在冲突中受伤，留下疤痕。',
  duration_seconds: 60,
  opening_hook: '刀光一闪。',
  ending_hook: '她抚过脸上的新疤。',
  script_sections: [
    {
      section_no: 1,
      type: 'opening',
      location: '仓库',
      characters: ['林晚'],
      description: '林晚在打斗中被划伤左脸。',
      dialogues: [],
      narration: null,
      emotion: '紧张',
    },
  ],
}

async function seed(db: DatabaseClient) {
  await db.insert(projects).values({
    id: 'project-1',
    title: 'eager test',
    genre: 'revenge',
    targetPlatform: 'douyin',
    visualStyle: 'realistic',
    episodeDuration: 60,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  })
  await db.insert(episodes).values({
    id: 'episode-2',
    projectId: 'project-1',
    episodeNo: 2,
    title: '第2集',
    scriptId: 'script-2',
    status: 'script_ready',
    createdAt: now,
    updatedAt: now,
  })
  await db.insert(scripts).values({
    id: 'script-2',
    projectId: 'project-1',
    episodeId: 'episode-2',
    title: scriptStructuredJson.title,
    summary: scriptStructuredJson.summary,
    content: '仓库: 林晚在打斗中被划伤左脸。',
    structuredJson: JSON.stringify(scriptStructuredJson),
    status: 'ready',
    createdAt: now,
    updatedAt: now,
  })
  await db.insert(characters).values({
    id: 'character-1',
    projectId: 'project-1',
    name: '林晚',
    appearance: '黑色礼服。',
    referenceImageUrl: '/static/base.png',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  })
}

function extractInput(taskId: string) {
  return {
    projectId: 'project-1',
    episodeId: 'episode-2',
    episode: {
      id: 'episode-2',
      projectId: 'project-1',
      episodeNo: 2,
      title: '第2集',
      status: 'script_ready',
    },
    script: {
      id: 'script-2',
      projectId: 'project-1',
      episodeId: 'episode-2',
      title: scriptStructuredJson.title,
      summary: scriptStructuredJson.summary,
      content: '仓库: 林晚在打斗中被划伤左脸。',
      status: 'ready',
    },
    scriptStructuredJson,
    projectStyle: {
      title: 'eager test',
      genre: 'revenge',
      targetPlatform: 'douyin',
      visualStyle: 'realistic',
      episodeDuration: 60,
    },
    taskId,
  }
}

describe('asset_extraction eager appearance version images', () => {
  it('generates the version reference image right after extraction', async () => {
    const db = await createTestDb()
    await seed(db)

    const provider = new MockStructuredTextProvider(() => ({
      characters: [
        {
          name: '林晚',
          usage_type: 'protagonist',
          appearance_change: {
            new_appearance: '黑色礼服，左脸有一道疤痕。',
            reason: '打斗中被划伤',
          },
        },
      ],
      scenes: [],
      props: [],
    }))
    const imageProvider = new MockImageProvider((request) => {
      expect(request.referenceImages).toEqual(['/static/base.png'])
      return '/static/version-eager.png'
    })
    const worker = startTestWorker(db, { provider, imageProvider })

    const taskId = 'task-extract-1'
    await db.insert(generationTasks).values({
      id: taskId,
      projectId: 'project-1',
      episodeId: 'episode-2',
      taskType: 'asset_extraction',
      inputJson: JSON.stringify(extractInput(taskId)),
      status: 'pending',
      retryCount: 0,
      createdAt: now,
      updatedAt: now,
    })
    void worker.announce(taskId)
    worker.notify()

    // The version image is generated inside the extraction handler, after the extraction
    // task row is already completed — poll for the write-back on the version row.
    let version: typeof characterAppearanceVersions.$inferSelect | undefined
    for (let attempt = 0; attempt < 100; attempt += 1) {
      ;[version] = await db.select().from(characterAppearanceVersions)
      if (version?.referenceImageUrl) break
      await new Promise((resolve) => setTimeout(resolve, 10))
    }

    expect(version?.sourceEpisodeId).toBe('episode-2')
    expect(version?.appearance).toBe('黑色礼服，左脸有一道疤痕。')
    expect(version?.referenceImageUrl).toBe('/static/version-eager.png')

    const assetRows = await db
      .select()
      .from(assets)
      .where(eq(assets.targetType, 'character_appearance_version'))
    expect(assetRows).toHaveLength(1)
    expect(assetRows[0].status).toBe('active')

    const [extractTask] = await db.select().from(generationTasks).where(eq(generationTasks.id, taskId))
    expect(extractTask.status).toBe('completed')
  })
})
