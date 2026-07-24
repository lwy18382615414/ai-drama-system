import { and, asc, eq, inArray } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { z } from 'zod/v4'
import type { DatabaseClient, GenerationTask } from '../../../packages/database/index.js'
import {
  batches,
  episodeCharacterLinks,
  episodeSceneLinks,
  episodes,
  generationJobs,
  generationTasks,
  novelChapters,
  projects,
  scripts,
  storyboards,
} from '../../../packages/database/index.js'
import type { StructuredTextProvider } from '../../../packages/providers/index.js'
import type { TaskScheduler } from '../../../packages/tasks/index.js'
import { plannedChapterEndNo } from './chapter-guards.js'
import { createGenerationJob } from './generation-job-service.js'
import { startBatchPlanning } from './episode-planner-service.js'
import { startScriptGeneration } from './script-service.js'
import { startAssetExtraction } from './asset-extraction-service.js'
import { startStoryboardGeneration } from './storyboard-service.js'
import { isUniqueConstraintError, type TaskOrchestration } from './task-orchestration.js'

export const PIPELINE_RUN_JOB_TYPE = 'pipeline_run'

export const StartPipelineRunRequestSchema = z.object({
  chapterEndNo: z.number().int().positive().optional(),
  generateImages: z.boolean().default(false),
})

export type StartPipelineRunRequest = z.infer<typeof StartPipelineRunRequestSchema>

/** Lifecycle state persisted on the job's `metadataJson`; it — not the task-derived
 * `job.status` — is the source of truth for whether a run is still active. */
export const PipelineRunMetadataSchema = z.object({
  chapterStartNo: z.number().int().positive(),
  chapterEndNo: z.number().int().positive(),
  generateImages: z.boolean(),
  /** Fixed terminal for the "no images" run; reserved for extension when generateImages is true. */
  terminalStage: z.literal('storyboards'),
  batchId: z.string().nullable(),
  phase: z.enum(['extracting', 'planning', 'producing', 'done', 'failed']),
  error: z.string().optional(),
})

export type PipelineRunMetadata = z.infer<typeof PipelineRunMetadataSchema>

export class PipelineRunServiceError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message)
  }
}

export interface PipelineRunDeps {
  db: DatabaseClient
  provider: StructuredTextProvider
  scheduler: TaskScheduler
}

const ACTIVE_TASK_STATUSES = ['pending', 'retry_wait', 'running'] as const

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Start a one-click run over the next batch: extract events for the selected contiguous
 * chapter range, plan it into episodes, then generate script → assets → storyboards for
 * each episode. Stops before any image generation. Idempotent per project: an already-active
 * run is returned instead of starting a second one.
 */
export async function startPipelineRun(deps: PipelineRunDeps, projectId: string, request: StartPipelineRunRequest) {
  const [project] = await deps.db.select().from(projects).where(eq(projects.id, projectId)).limit(1)
  if (!project) throw new PipelineRunServiceError(`Project not found: ${projectId}`, 404)

  const existing = await findActivePipelineRun(deps.db, projectId)
  if (existing) {
    return { jobId: existing.jobId, reused: true as const }
  }

  const chapterStartNo = (await plannedChapterEndNo(deps.db, projectId)) + 1
  const chapters = await deps.db
    .select({ chapterNo: novelChapters.chapterNo })
    .from(novelChapters)
    .where(eq(novelChapters.projectId, projectId))
    .orderBy(asc(novelChapters.chapterNo))

  if (chapters.length === 0) {
    throw new PipelineRunServiceError(`Project has no novel chapters: ${projectId}`, 400)
  }

  const maxChapterNo = chapters.at(-1)!.chapterNo
  if (chapterStartNo > maxChapterNo) {
    throw new PipelineRunServiceError('All chapters are already planned into batches', 422)
  }

  const chapterEndNo = request.chapterEndNo ?? maxChapterNo
  if (chapterEndNo < chapterStartNo || chapterEndNo > maxChapterNo) {
    throw new PipelineRunServiceError(`chapterEndNo must be within [${chapterStartNo}, ${maxChapterNo}]`, 422)
  }

  const chapterNos = new Set(chapters.map((c) => c.chapterNo))
  for (let no = chapterStartNo; no <= chapterEndNo; no += 1) {
    if (!chapterNos.has(no)) {
      throw new PipelineRunServiceError(`Chapter range is not contiguous: missing chapter ${no}`, 422)
    }
  }

  const jobId = await createGenerationJob(deps.db, { projectId, jobType: PIPELINE_RUN_JOB_TYPE, totalCount: 0 })
  const metadata: PipelineRunMetadata = {
    chapterStartNo,
    chapterEndNo,
    generateImages: request.generateImages,
    terminalStage: 'storyboards',
    batchId: null,
    phase: 'extracting',
  }
  const now = new Date().toISOString()
  // createGenerationJob defaults a zero-task job to 'completed'; the run is not complete —
  // its lifecycle is tracked by metadata.phase, so mark the job running for progress display.
  await deps.db
    .update(generationJobs)
    .set({ status: 'running', metadataJson: JSON.stringify(metadata), updatedAt: now })
    .where(eq(generationJobs.id, jobId))

  await advancePipelineRun(deps, jobId)
  return { jobId, reused: false as const }
}

/** Returns the active (non-terminal) pipeline run for a project, or null. */
export async function findActivePipelineRun(db: DatabaseClient, projectId: string) {
  const rows = await db
    .select()
    .from(generationJobs)
    .where(and(eq(generationJobs.projectId, projectId), eq(generationJobs.jobType, PIPELINE_RUN_JOB_TYPE)))
  for (const row of rows) {
    const meta = safeParseMetadata(row.metadataJson)
    if (meta && meta.phase !== 'done' && meta.phase !== 'failed') {
      return { jobId: row.id, metadata: meta, job: row }
    }
  }
  return null
}

/**
 * Idempotently advance one pipeline run: enqueue whatever steps are now unblocked and not yet
 * queued. Serialized per job in-process so concurrent task settlements can't double-enqueue;
 * the idempotency-key UNIQUE index is the durable backstop across restarts/processes.
 */
export function advancePipelineRun(deps: PipelineRunDeps, jobId: string): Promise<void> {
  const previous = advanceLocks.get(jobId) ?? Promise.resolve()
  const next = previous.catch(() => {}).then(() => runAdvance(deps, jobId))
  advanceLocks.set(jobId, next)
  void next.finally(() => {
    if (advanceLocks.get(jobId) === next) advanceLocks.delete(jobId)
  })
  return next
}

/** Re-advance every active run; run at worker startup and on the periodic safety poll so a
 * settle-hook missed across a restart still resumes the chain. */
export async function sweepActivePipelineRuns(deps: PipelineRunDeps): Promise<void> {
  const rows = await deps.db.select().from(generationJobs).where(eq(generationJobs.jobType, PIPELINE_RUN_JOB_TYPE))
  for (const row of rows) {
    const meta = safeParseMetadata(row.metadataJson)
    if (meta && meta.phase !== 'done' && meta.phase !== 'failed') {
      await advancePipelineRun(deps, row.id).catch((error) => {
        console.error(`[pipeline-run] sweep advance failed for job ${row.id}`, error)
      })
    }
  }
}

// ─── Advance implementation ─────────────────────────────────────────────────────

const advanceLocks = new Map<string, Promise<void>>()

async function runAdvance(deps: PipelineRunDeps, jobId: string): Promise<void> {
  const [job] = await deps.db.select().from(generationJobs).where(eq(generationJobs.id, jobId)).limit(1)
  if (!job || job.jobType !== PIPELINE_RUN_JOB_TYPE) return
  const meta = safeParseMetadata(job.metadataJson)
  if (!meta || meta.phase === 'done' || meta.phase === 'failed') return

  const jobTasks = await deps.db.select().from(generationTasks).where(eq(generationTasks.jobId, jobId))

  const chapters = await deps.db
    .select({ chapterNo: novelChapters.chapterNo, status: novelChapters.status, id: novelChapters.id })
    .from(novelChapters)
    .where(eq(novelChapters.projectId, job.projectId))
  const rangeChapters = chapters.filter((c) => c.chapterNo >= meta.chapterStartNo && c.chapterNo <= meta.chapterEndNo)
  const unextracted = rangeChapters.filter((c) => c.status !== 'event_extracted')

  // ── Phase 1a: event extraction ────────────────────────────────────────────────
  if (unextracted.length > 0) {
    const extractionByChapter = new Map<string, GenerationTask>()
    for (const task of jobTasks) {
      if (task.taskType !== 'event_extraction') continue
      const chapterId = parseChapterId(task.inputJson)
      if (chapterId) extractionByChapter.set(chapterId, task)
    }

    let anyActionable = false
    let anyFailed = false
    for (const chapter of unextracted) {
      const task = extractionByChapter.get(chapter.id)
      if (task && ACTIVE_TASK_STATUSES.includes(task.status as never)) {
        anyActionable = true
        continue
      }
      if (task && task.status === 'failed') {
        anyFailed = true
        continue
      }
      // No task yet (or a prior non-failed terminal that didn't extract) → enqueue.
      await enqueueEventExtraction(deps, {
        projectId: job.projectId,
        chapterId: chapter.id,
        jobId,
        idempotencyKey: `pipeline:${jobId}:chapter:${chapter.id}:event_extraction`,
      })
      anyActionable = true
    }

    // Extraction is a hard gate for planning: if nothing can still make progress and at least
    // one chapter failed, the whole run cannot proceed.
    if (!anyActionable && anyFailed) {
      await setPhase(deps.db, jobId, meta, 'failed', 'Event extraction failed for one or more chapters')
    }
    return
  }

  // ── Phase 1b: batch planning ──────────────────────────────────────────────────
  const planningTask = jobTasks.find((t) => t.taskType === 'episode_planning')
  let batchId = meta.batchId
  if (!batchId) {
    if (!planningTask) {
      const result = await startBatchPlanning(
        deps,
        job.projectId,
        { chapterEndNo: meta.chapterEndNo, options: undefined },
        { jobId, idempotencyKey: `pipeline:${jobId}:planning` },
      )
      await setBatchId(deps.db, jobId, meta, result.batchId, 'planning')
      return
    }
    if (planningTask.status === 'failed') {
      await setPhase(deps.db, jobId, meta, 'failed', 'Episode planning failed')
      return
    }
    // Planning in flight but batchId not yet persisted (crash between enqueue and setBatchId):
    // recover it from the batch row for this exact range.
    const [batch] = await deps.db
      .select({ id: batches.id })
      .from(batches)
      .where(
        and(
          eq(batches.projectId, job.projectId),
          eq(batches.chapterStartNo, meta.chapterStartNo),
          eq(batches.chapterEndNo, meta.chapterEndNo),
        ),
      )
      .limit(1)
    if (!batch) return // planning still running, batch row not visible yet
    batchId = batch.id
    await setBatchId(deps.db, jobId, meta, batchId, meta.phase)
  }

  const episodeRows = await deps.db
    .select({ id: episodes.id })
    .from(episodes)
    .where(eq(episodes.batchId, batchId))
    .orderBy(asc(episodes.episodeNo))

  if (episodeRows.length === 0) {
    // Batch exists but planning hasn't produced episodes yet — or it failed producing none.
    if (planningTask?.status === 'failed') {
      await setPhase(deps.db, jobId, { ...meta, batchId }, 'failed', 'Episode planning failed')
    }
    return
  }

  // ── Phase 2: per-episode production (script → assets → storyboards) ────────────
  await advanceProduction(deps, jobId, { ...meta, batchId }, episodeRows.map((e) => e.id), jobTasks)
}

async function advanceProduction(
  deps: PipelineRunDeps,
  jobId: string,
  meta: PipelineRunMetadata,
  episodeIds: string[],
  jobTasks: GenerationTask[],
): Promise<void> {
  const [scriptRows, characterLinkRows, sceneLinkRows, storyboardRows] = await Promise.all([
    deps.db.select({ episodeId: scripts.episodeId }).from(scripts).where(inArray(scripts.episodeId, episodeIds)),
    deps.db
      .select({ episodeId: episodeCharacterLinks.episodeId })
      .from(episodeCharacterLinks)
      .where(inArray(episodeCharacterLinks.episodeId, episodeIds)),
    deps.db
      .select({ episodeId: episodeSceneLinks.episodeId })
      .from(episodeSceneLinks)
      .where(inArray(episodeSceneLinks.episodeId, episodeIds)),
    deps.db.select({ episodeId: storyboards.episodeId }).from(storyboards).where(inArray(storyboards.episodeId, episodeIds)),
  ])
  const hasScript = new Set(scriptRows.map((r) => r.episodeId))
  const hasCharacters = new Set(characterLinkRows.map((r) => r.episodeId))
  const hasScenes = new Set(sceneLinkRows.map((r) => r.episodeId))
  const hasStoryboards = new Set(storyboardRows.map((r) => r.episodeId))

  // (episodeId, taskType) → task, for active/terminal detection.
  const taskByEpisodeStep = new Map<string, GenerationTask>()
  for (const task of jobTasks) {
    if (task.episodeId) taskByEpisodeStep.set(`${task.episodeId}:${task.taskType}`, task)
  }

  let allDone = true
  let anyActionable = false

  for (const episodeId of episodeIds) {
    // Assets are "ready" for storyboarding when both characters and scenes are linked.
    const assetsReady = hasCharacters.has(episodeId) && hasScenes.has(episodeId)

    const step = !hasScript.has(episodeId)
      ? ('script_generation' as const)
      : !assetsReady
        ? ('asset_extraction' as const)
        : !hasStoryboards.has(episodeId)
          ? ('storyboard_generation' as const)
          : null

    if (step === null) continue // episode reached storyboards

    allDone = false
    const stepTask = taskByEpisodeStep.get(`${episodeId}:${step}`)
    if (stepTask) {
      // A task already exists for this step. If it's still running it will make progress; any
      // terminal state (failed, or completed but its expected output isn't present) stalls this
      // episode — never re-enqueue, so siblings proceed and the run can settle as failed.
      if (ACTIVE_TASK_STATUSES.includes(stepTask.status as never)) anyActionable = true
      continue
    }

    const idempotencyKey = `pipeline:${jobId}:${episodeId}:${step}`
    try {
      if (step === 'script_generation') {
        await startScriptGeneration(deps, episodeId, {}, { jobId, idempotencyKey })
      } else if (step === 'asset_extraction') {
        await startAssetExtraction(deps, episodeId, {}, { jobId, idempotencyKey, skipReferenceImages: !meta.generateImages })
      } else {
        await startStoryboardGeneration(deps, episodeId, {}, { jobId, idempotencyKey })
      }
      anyActionable = true
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        anyActionable = true
        continue
      }
      // A build-input failure (e.g. episode with no linked events) stalls this episode only.
      console.error(`[pipeline-run] enqueue ${step} failed for episode ${episodeId}`, error)
    }
  }

  if (allDone) {
    await setPhase(deps.db, jobId, meta, 'done')
  } else if (!anyActionable) {
    await setPhase(deps.db, jobId, meta, 'failed', 'One or more episodes could not complete')
  } else if (meta.phase !== 'producing') {
    await setPhase(deps.db, jobId, meta, 'producing')
  }
}

// ─── Enqueue + metadata helpers ─────────────────────────────────────────────────

async function enqueueEventExtraction(
  deps: PipelineRunDeps,
  args: { projectId: string; chapterId: string; jobId: string; idempotencyKey: string },
): Promise<void> {
  if (await taskExists(deps.db, args.idempotencyKey)) return
  const taskId = nanoid()
  const now = new Date().toISOString()
  try {
    await deps.db.insert(generationTasks).values({
      id: taskId,
      projectId: args.projectId,
      episodeId: null,
      storyboardId: null,
      taskType: 'event_extraction',
      provider: deps.provider.name,
      model: deps.provider.model,
      inputJson: JSON.stringify({ projectId: args.projectId, chapterId: args.chapterId, taskId }),
      outputJson: null,
      status: 'pending',
      retryCount: 0,
      jobId: args.jobId,
      idempotencyKey: args.idempotencyKey,
      errorMessage: null,
      startedAt: null,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    })
  } catch (error) {
    if (isUniqueConstraintError(error)) return
    throw error
  }
  void deps.scheduler.announce(taskId)
  deps.scheduler.notify()
}

async function taskExists(db: DatabaseClient, idempotencyKey: string): Promise<boolean> {
  const [row] = await db
    .select({ id: generationTasks.id })
    .from(generationTasks)
    .where(eq(generationTasks.idempotencyKey, idempotencyKey))
    .limit(1)
  return Boolean(row)
}

async function setPhase(
  db: DatabaseClient,
  jobId: string,
  meta: PipelineRunMetadata,
  phase: PipelineRunMetadata['phase'],
  error?: string,
): Promise<void> {
  const next: PipelineRunMetadata = { ...meta, phase, ...(error ? { error } : {}) }
  await db
    .update(generationJobs)
    .set({ metadataJson: JSON.stringify(next), updatedAt: new Date().toISOString() })
    .where(eq(generationJobs.id, jobId))
}

async function setBatchId(
  db: DatabaseClient,
  jobId: string,
  meta: PipelineRunMetadata,
  batchId: string,
  phase: PipelineRunMetadata['phase'],
): Promise<void> {
  const next: PipelineRunMetadata = { ...meta, batchId, phase }
  await db
    .update(generationJobs)
    .set({ metadataJson: JSON.stringify(next), updatedAt: new Date().toISOString() })
    .where(eq(generationJobs.id, jobId))
}

function safeParseMetadata(value: string): PipelineRunMetadata | null {
  try {
    return PipelineRunMetadataSchema.parse(JSON.parse(value))
  } catch {
    return null
  }
}

function parseChapterId(inputJson: string): string | null {
  try {
    const parsed = JSON.parse(inputJson) as { chapterId?: unknown }
    return typeof parsed?.chapterId === 'string' && parsed.chapterId.length > 0 ? parsed.chapterId : null
  } catch {
    return null
  }
}
