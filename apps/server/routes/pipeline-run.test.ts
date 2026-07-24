import { eq, inArray } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import {
  createDatabase,
  episodeCharacterLinks,
  episodeSceneLinks,
  episodes,
  generationJobs,
  initializeDatabase,
  novelChapters,
  projects,
  scripts,
  storyboards,
  type DatabaseClient,
} from '../../../packages/database/index.js'
import {
  MockImageProvider,
  MockStructuredTextProvider,
  type GenerateStructuredJsonRequest,
} from '../../../packages/providers/index.js'
import { startTestWorker } from '../test-helpers/task-worker.js'
import {
  PipelineRunMetadataSchema,
  startPipelineRun,
  type PipelineRunMetadata,
} from '../services/pipeline-run-service.js'

const now = new Date().toISOString()

async function createTestDb() {
  const db = await createDatabase(':memory:')
  await initializeDatabase(db)
  return db
}

async function seedProjectWithChapters(db: DatabaseClient, chapterCount: number) {
  await db.insert(projects).values({
    id: 'project-1',
    title: 'pipeline test',
    genre: 'revenge',
    targetPlatform: 'douyin',
    visualStyle: 'realistic',
    episodeDuration: 60,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  })
  for (let no = 1; no <= chapterCount; no += 1) {
    await db.insert(novelChapters).values({
      id: `chapter-${no}`,
      projectId: 'project-1',
      chapterNo: no,
      title: `第 ${no} 章`,
      content: `第 ${no} 章正文：主角在冲突中做出选择，推动剧情发展。`.repeat(10),
      wordCount: 300,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    })
  }
}

async function readMetadata(db: DatabaseClient, jobId: string): Promise<PipelineRunMetadata> {
  const [job] = await db.select().from(generationJobs).where(eq(generationJobs.id, jobId)).limit(1)
  return PipelineRunMetadataSchema.parse(JSON.parse(job.metadataJson))
}

/** Poll the run's metadata phase until terminal (done/failed) or timeout. */
async function waitForPhase(
  db: DatabaseClient,
  jobId: string,
  target: PipelineRunMetadata['phase'][],
): Promise<PipelineRunMetadata> {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const meta = await readMetadata(db, jobId)
    if (target.includes(meta.phase)) return meta
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  return readMetadata(db, jobId)
}

describe('one-click pipeline run', () => {
  it('drives extract → plan → script → assets → storyboards with no image generation', async () => {
    const db = await createTestDb()
    await seedProjectWithChapters(db, 2)

    let imageCalls = 0
    const imageProvider = new MockImageProvider(() => {
      imageCalls += 1
      return '/static/should-not-happen.png'
    })
    const worker = startTestWorker(db, { imageProvider, concurrency: 1 })

    const { jobId, reused } = await startPipelineRun(
      { db, provider: new MockStructuredTextProvider(), scheduler: worker },
      'project-1',
      { generateImages: false },
    )
    expect(reused).toBe(false)

    const meta = await waitForPhase(db, jobId, ['done', 'failed'])
    expect(meta.phase).toBe('done')

    // Every episode in the batch reached storyboards, all text, zero images.
    const episodeRows = await db.select().from(episodes).where(eq(episodes.batchId, meta.batchId!))
    expect(episodeRows.length).toBeGreaterThan(0)
    const episodeIds = episodeRows.map((e) => e.id)

    const [scriptRows, characterLinks, sceneLinks, storyboardRows] = await Promise.all([
      db.select().from(scripts).where(inArray(scripts.episodeId, episodeIds)),
      db.select().from(episodeCharacterLinks).where(inArray(episodeCharacterLinks.episodeId, episodeIds)),
      db.select().from(episodeSceneLinks).where(inArray(episodeSceneLinks.episodeId, episodeIds)),
      db.select().from(storyboards).where(inArray(storyboards.episodeId, episodeIds)),
    ])

    for (const episodeId of episodeIds) {
      expect(scriptRows.some((r) => r.episodeId === episodeId)).toBe(true)
      expect(characterLinks.some((r) => r.episodeId === episodeId)).toBe(true)
      expect(sceneLinks.some((r) => r.episodeId === episodeId)).toBe(true)
      expect(storyboardRows.some((r) => r.episodeId === episodeId)).toBe(true)
    }

    expect(imageCalls).toBe(0)

    worker.stop()
  })

  it('returns the same run when one is already active', async () => {
    const db = await createTestDb()
    await seedProjectWithChapters(db, 1)
    // No real worker: an inert scheduler keeps the run parked in `extracting` so the second
    // call deterministically observes it as active.
    const scheduler = { announce: async () => {}, notify: () => {} }
    const deps = { db, provider: new MockStructuredTextProvider(), scheduler }

    const first = await startPipelineRun(deps, 'project-1', { generateImages: false })
    const second = await startPipelineRun(deps, 'project-1', { generateImages: false })

    expect(second.reused).toBe(true)
    expect(second.jobId).toBe(first.jobId)
  })

  it('isolates a per-episode failure: siblings still reach storyboards, run ends failed', async () => {
    const db = await createTestDb()
    await seedProjectWithChapters(db, 2)

    let scriptCalls = 0
    // Plan two episodes (one event each); fail the first script call so exactly one episode stalls.
    const factory = (request: GenerateStructuredJsonRequest<unknown>): unknown => {
      const meta = request.metadata ?? {}
      if (request.schemaName === 'EpisodePlannerOutput') {
        const eventIds = Array.isArray(meta.sourceEventIds) ? meta.sourceEventIds.map(String) : []
        return {
          episodes: eventIds.map((eventId, index) => ({
            title: `Mock episode ${index + 1}`,
            summary: 'Mock plan.',
            opening_hook: 'Hook.',
            ending_hook: 'Cliffhanger.',
            source_event_links: [{ novel_event_id: eventId, order_in_episode: 1, usage_type: 'primary' }],
          })),
        }
      }
      if (request.schemaName === 'ScriptAgentOutput') {
        scriptCalls += 1
        if (scriptCalls === 1) throw new Error('Simulated script generation failure')
        return {
          title: 'Mock script',
          summary: 'Mock.',
          duration_seconds: 60,
          opening_hook: 'Opening.',
          ending_hook: 'Ending.',
          script_sections: [
            { section_no: 1, type: 'opening', location: 'Mock location', characters: [], description: 'Opens.', dialogues: [], narration: 'Tense.', emotion: 'tense' },
          ],
        }
      }
      if (request.schemaName === 'ExtractAgentOutput') {
        return {
          characters: [{ name: 'Mock Protagonist', alias_json: [], role: 'protagonist', appearance: 'A.', personality: 'D.', relationship_json: [], usage_type: 'protagonist' }],
          scenes: [{ name: 'Mock location', description: 'Loc.', location_type: 'interior', visual_style: 'realistic', visual_prompt: 'V.', usage_type: 'primary_location' }],
          props: [],
        }
      }
      if (request.schemaName === 'StoryboardAgentOutput') {
        const sceneIds = Array.isArray(meta.sceneIds) ? meta.sceneIds.map(String) : ['mock-scene']
        const characterIds = Array.isArray(meta.characterIds) ? meta.characterIds.map(String) : []
        return {
          storyboards: [
            { shot_no: 1, duration: 5, scene_id: sceneIds[0], character_ids: characterIds.slice(0, 1), prop_ids: [], script_section_no: 1, shot_type: 'medium', camera_angle: 'eye_level', camera_movement: 'static', action: 'The protagonist faces the situation.', dialogue: [], narration: 'Tension.', emotion: 'tense', image_prompt: 'Realistic medium shot, cinematic lighting.', video_prompt: 'Protagonist enters, static camera.' },
          ],
        }
      }
      // EventAgentOutput fallback.
      return {
        chapterId: String(meta.chapterId ?? 'unknown-chapter'),
        chapterSummary: 'Mock chapter summary.',
        events: [
          { eventNo: 1, eventType: 'setup', summary: 'Setup.', detail: 'A dramatic beat establishes the protagonist.', characters: [], emotionTone: 'tense', conflictLevel: 'low', importance: 'major' },
        ],
        totalEvents: 1,
      }
    }

    let imageCalls = 0
    const imageProvider = new MockImageProvider(() => {
      imageCalls += 1
      return '/static/nope.png'
    })
    const worker = startTestWorker(db, { provider: new MockStructuredTextProvider(factory), imageProvider, concurrency: 1 })

    const { jobId } = await startPipelineRun(
      { db, provider: new MockStructuredTextProvider(factory), scheduler: worker },
      'project-1',
      { generateImages: false },
    )

    const meta = await waitForPhase(db, jobId, ['done', 'failed'])
    expect(meta.phase).toBe('failed')

    const episodeRows = await db.select().from(episodes).where(eq(episodes.batchId, meta.batchId!))
    expect(episodeRows.length).toBe(2)
    const episodeIds = episodeRows.map((e) => e.id)

    const scriptRows = await db.select().from(scripts).where(inArray(scripts.episodeId, episodeIds))
    const storyboardRows = await db.select().from(storyboards).where(inArray(storyboards.episodeId, episodeIds))

    // Exactly one episode completed (script + storyboards); the other stalled at script.
    expect(scriptRows.length).toBe(1)
    expect(new Set(storyboardRows.map((r) => r.episodeId)).size).toBe(1)
    expect(imageCalls).toBe(0)

    worker.stop()
  })
})
