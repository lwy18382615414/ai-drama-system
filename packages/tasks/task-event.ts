import { eq } from 'drizzle-orm'
import type { DatabaseClient, GenerationTask } from '../database/index.js'
import { batches, characters, episodes, novelChapters, scenes, storyboards } from '../database/index.js'

/**
 * A task lifecycle event, emitted whenever a `generation_tasks` row changes status.
 * Shared by the {@link TaskEventBus} (live push) and the reconnect snapshot query so that
 * both carry an identical payload shape to clients.
 */
export interface TaskEvent {
  taskId: string
  projectId: string
  taskType: string
  targetType: string | null
  targetId: string | null
  episodeId: string | null
  storyboardId: string | null
  /** Human-readable name of the task's target (e.g. episode title), or null when unresolvable. */
  targetName: string | null
  /** Localized task-type label, derived from taskType (and targetType for image tasks). */
  targetLabel: string
  status: string
  retryCount: number
  errorMessage: string | null
  updatedAt: string
}

/**
 * Process-local pub/sub over task lifecycle events, scoped by project. The {@link TaskWorker}
 * implements this so SSE endpoints can subscribe without an external message broker.
 * Swap for Redis Pub/Sub (or Postgres LISTEN/NOTIFY) when moving beyond a single process.
 */
export interface TaskEventBus {
  /** Registers a listener for a project's task events. Returns an unsubscribe function. */
  subscribe(projectId: string, listener: (event: TaskEvent) => void): () => void
}

const TASK_TYPE_LABELS: Record<string, string> = {
  event_extraction: '事件提取',
  episode_planning: '剧集规划',
  script_generation: '剧本生成',
  asset_extraction: '资产提取',
  storyboard_generation: '分镜生成',
  image_generation: '图片生成',
}

// Image tasks all persist taskType 'image_generation'; the real kind lives in targetType.
const IMAGE_TARGET_TYPE_LABELS: Record<string, string> = {
  character_reference_image: '角色参考图',
  scene_reference_image: '场景参考图',
  storyboard_first_frame: '分镜首帧图',
}

/** Localized label for a task, resolving image tasks by their targetType. */
export function taskTargetLabel(row: Pick<GenerationTask, 'taskType' | 'targetType'>): string {
  if (row.taskType === 'image_generation') {
    return (row.targetType && IMAGE_TARGET_TYPE_LABELS[row.targetType]) || TASK_TYPE_LABELS.image_generation
  }
  return TASK_TYPE_LABELS[row.taskType] ?? row.taskType
}

/**
 * Projects a persisted task row onto the wire-facing {@link TaskEvent} shape. Synchronous, so
 * `targetName` starts null — call {@link enrichTaskEvent} to resolve it against the database.
 */
export function toTaskEvent(row: GenerationTask): TaskEvent {
  return {
    taskId: row.id,
    projectId: row.projectId,
    taskType: row.taskType,
    targetType: row.targetType ?? null,
    targetId: row.targetId ?? null,
    episodeId: row.episodeId ?? null,
    storyboardId: row.storyboardId ?? null,
    targetName: null,
    targetLabel: taskTargetLabel(row),
    status: row.status,
    retryCount: row.retryCount,
    errorMessage: row.errorMessage ?? null,
    updatedAt: row.updatedAt,
  }
}

/** {@link toTaskEvent} plus a database lookup for the target's human-readable name. */
export async function enrichTaskEvent(db: DatabaseClient, row: GenerationTask): Promise<TaskEvent> {
  return { ...toTaskEvent(row), targetName: await resolveTaskTargetName(db, row) }
}

/**
 * Resolves the target's display name for a task row. Best-effort: any failure (target deleted by
 * a re-plan, malformed inputJson, unknown type) resolves to null so the client falls back to the
 * type label alone.
 */
async function resolveTaskTargetName(db: DatabaseClient, row: GenerationTask): Promise<string | null> {
  try {
    switch (row.taskType) {
      case 'script_generation':
      case 'asset_extraction':
      case 'storyboard_generation':
        return row.episodeId ? await episodeName(db, row.episodeId) : null
      case 'image_generation':
        return await imageTargetName(db, row)
      case 'episode_planning':
        return await planningName(db, row)
      case 'event_extraction':
        return await extractionName(db, row)
      default:
        return null
    }
  } catch {
    return null
  }
}

async function episodeName(db: DatabaseClient, episodeId: string): Promise<string | null> {
  const [ep] = await db
    .select({ title: episodes.title, episodeNo: episodes.episodeNo })
    .from(episodes)
    .where(eq(episodes.id, episodeId))
    .limit(1)
  if (!ep) return null
  return ep.title ?? `第${ep.episodeNo}集`
}

async function episodeNo(db: DatabaseClient, episodeId: string): Promise<number | null> {
  const [ep] = await db
    .select({ episodeNo: episodes.episodeNo })
    .from(episodes)
    .where(eq(episodes.id, episodeId))
    .limit(1)
  return ep?.episodeNo ?? null
}

async function imageTargetName(db: DatabaseClient, row: GenerationTask): Promise<string | null> {
  switch (row.targetType) {
    case 'character_reference_image': {
      if (!row.targetId) return null
      const [c] = await db
        .select({ name: characters.name })
        .from(characters)
        .where(eq(characters.id, row.targetId))
        .limit(1)
      return c?.name ?? null
    }
    case 'scene_reference_image': {
      if (!row.targetId) return null
      const [s] = await db.select({ name: scenes.name }).from(scenes).where(eq(scenes.id, row.targetId)).limit(1)
      return s?.name ?? null
    }
    case 'storyboard_first_frame': {
      const storyboardId = row.storyboardId ?? row.targetId
      if (!storyboardId) return null
      const [sb] = await db
        .select({ shotNo: storyboards.shotNo, episodeId: storyboards.episodeId })
        .from(storyboards)
        .where(eq(storyboards.id, storyboardId))
        .limit(1)
      if (!sb) return null
      const no = await episodeNo(db, row.episodeId ?? sb.episodeId)
      return no != null ? `第${no}集 镜头${sb.shotNo}` : `镜头${sb.shotNo}`
    }
    default:
      return null
  }
}

async function planningName(db: DatabaseClient, row: GenerationTask): Promise<string | null> {
  const batchId = parseInputField(row.inputJson, 'batchId')
  if (!batchId) return null
  const [b] = await db
    .select({
      batchNo: batches.batchNo,
      chapterStartNo: batches.chapterStartNo,
      chapterEndNo: batches.chapterEndNo,
    })
    .from(batches)
    .where(eq(batches.id, batchId))
    .limit(1)
  if (!b) return null
  return `第${b.batchNo}批·第${b.chapterStartNo}-${b.chapterEndNo}章`
}

async function extractionName(db: DatabaseClient, row: GenerationTask): Promise<string | null> {
  const chapterId = parseInputField(row.inputJson, 'chapterId')
  if (!chapterId) return null
  const [c] = await db
    .select({ title: novelChapters.title, chapterNo: novelChapters.chapterNo })
    .from(novelChapters)
    .where(eq(novelChapters.id, chapterId))
    .limit(1)
  if (!c) return null
  return c.title ?? `第${c.chapterNo}章`
}

/** Safely reads a non-empty string field out of a task's persisted inputJson. */
function parseInputField(inputJson: string, key: string): string | null {
  try {
    const parsed = JSON.parse(inputJson) as Record<string, unknown>
    const value = parsed?.[key]
    return typeof value === 'string' && value.length > 0 ? value : null
  } catch {
    return null
  }
}
