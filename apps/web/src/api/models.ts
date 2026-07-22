/**
 * Shared domain models — hand-mirrored from the backend DB rows and service
 * return shapes (packages/database/schema.ts + apps/server/services/*).
 *
 * Convention (verified against the services):
 *   - Most read endpoints return RAW Drizzle rows, so JSON columns stay as their
 *     stringified `...Json` form (typed `string` here). Parse at the call site.
 *   - A few endpoints return SERIALIZED rows that ADD parsed fields alongside the
 *     raw ones (SerializedCharacter, SerializedStoryboard, SerializedAppearanceVersion,
 *     SceneDetail). Those extra fields are modelled explicitly.
 *
 * These types are shared across the api/<resource>.ts modules to avoid duplicating
 * row shapes that appear in many responses (Episode, Character, ...).
 */

/** generation_tasks.task_type */
export type TaskType =
  | 'event_extraction'
  | 'episode_planning'
  | 'script_generation'
  | 'asset_extraction'
  | 'storyboard_generation'
  | 'project_profile'
  | 'image_generation'

/** generation_tasks.status */
export type TaskStatus = 'pending' | 'running' | 'retry_wait' | 'completed' | 'failed' | 'cancelled'

/** Image generation target discriminator (image-generation-service ImageTargetTypeSchema). */
export type ImageTargetType =
  | 'character_reference_image'
  | 'character_appearance_version'
  | 'scene_reference_image'
  | 'storyboard_first_frame'

/** Derived per-stage display status (episode-pipeline-service PipelineDisplayStatus). */
export type PipelineDisplayStatus = 'not_started' | 'queued' | 'running' | 'ready' | 'stale' | 'failed'

// ── Raw DB rows ──────────────────────────────────────────────────────────────

export interface Project {
  id: string
  title: string
  description: string | null
  genre: string
  targetPlatform: string
  visualStyle: string
  episodeDuration: number
  status: string
  createdAt: string
  updatedAt: string
}

export interface Batch {
  id: string
  projectId: string
  batchNo: number
  chapterStartNo: number
  chapterEndNo: number
  episodeStartNo: number
  episodeEndNo: number
  status: string
  createdAt: string
  updatedAt: string
}

export interface Episode {
  id: string
  projectId: string
  batchId: string | null
  episodeNo: number
  title: string | null
  summary: string | null
  openingHook: string | null
  endingHook: string | null
  scriptId: string | null
  videoUrl: string | null
  status: string
  createdAt: string
  updatedAt: string
}

export interface Script {
  id: string
  projectId: string
  episodeId: string
  title: string
  summary: string
  openingHook: string | null
  endingHook: string | null
  content: string
  structuredJson: string
  status: string
  createdAt: string
  updatedAt: string
}

export interface NovelChapter {
  id: string
  projectId: string
  chapterNo: number
  title: string | null
  content: string
  wordCount: number
  source: string | null
  status: string
  createdAt: string
  updatedAt: string
}

export interface NovelEvent {
  id: string
  projectId: string
  chapterId: string
  eventNo: number
  eventType: string
  summary: string
  detail: string
  charactersJson: string
  location: string | null
  timeHint: string | null
  emotionTone: string | null
  conflictLevel: string
  importance: string
  sourceTextRangeJson: string | null
  createdAt: string
  updatedAt: string
}

export interface EpisodeEventLink {
  id: string
  projectId: string
  episodeId: string
  novelEventId: string
  orderInEpisode: number
  usageType: string
  createdAt: string
  updatedAt: string
}

/** Raw characters row (before serialization). */
export interface CharacterRow {
  id: string
  projectId: string
  name: string
  aliasJson: string
  role: string | null
  age: string | null
  gender: string | null
  appearance: string | null
  personality: string | null
  background: string | null
  relationshipJson: string
  referenceImageUrl: string | null
  voiceId: string | null
  status: string
  createdAt: string
  updatedAt: string
}

/** serializeCharacter(): aliasJson/relationshipJson are replaced by parsed arrays, plus a snake_case alias. */
export interface Character extends Omit<CharacterRow, 'aliasJson' | 'relationshipJson'> {
  aliasJson: string[]
  relationshipJson: unknown[]
  reference_image_url: string | null
}

export interface Scene {
  id: string
  projectId: string
  name: string
  description: string | null
  locationType: string | null
  visualStyle: string | null
  visualPrompt: string | null
  referenceImageUrl: string | null
  status: string
  createdAt: string
  updatedAt: string
}

/** getScene() adds a snake_case alias alongside the raw row. */
export interface SceneDetail extends Scene {
  reference_image_url: string | null
}

export interface Prop {
  id: string
  projectId: string
  name: string
  description: string | null
  significance: string | null
  visualPrompt: string | null
  referenceImageUrl: string | null
  status: string
  createdAt: string
  updatedAt: string
}

export interface EpisodeAssetLink {
  id: string
  projectId: string
  episodeId: string
  usageType: string
  createdAt: string
  updatedAt: string
}

/** Raw storyboards row (before serialization). */
export interface StoryboardRow {
  id: string
  projectId: string
  episodeId: string
  shotNo: number
  duration: number
  sceneId: string | null
  characterIdsJson: string
  propIdsJson: string
  scriptSectionNo: number | null
  shotType: string
  cameraAngle: string | null
  cameraMovement: string | null
  action: string
  dialogueJson: string
  narration: string | null
  emotion: string | null
  imagePrompt: string
  videoPrompt: string
  firstFrameImageUrl: string | null
  lastFrameImageUrl: string | null
  videoUrl: string | null
  ttsAudioUrl: string | null
  subtitleUrl: string | null
  composedVideoUrl: string | null
  status: string
  createdAt: string
  updatedAt: string
}

/** serializeStoryboard(): keeps the raw `...Json` strings and ADDS parsed helpers. */
export interface Storyboard extends StoryboardRow {
  characterIds: string[]
  propIds: string[]
  dialogue: unknown[]
}

export interface CharacterAppearanceVersion {
  id: string
  characterId: string
  sourceEpisodeId: string | null
  effectiveFromEpisodeNo: number | null
  appearance: string
  referenceImageUrl: string | null
  changeReason: string | null
  createdAt: string
  updatedAt: string
}

/** listAppearanceVersions/create/update add the live effective episode number. */
export interface SerializedAppearanceVersion extends CharacterAppearanceVersion {
  effectiveEpisodeNo: number
}

export interface GenerationTask {
  id: string
  projectId: string
  episodeId: string | null
  storyboardId: string | null
  targetType: string | null
  targetId: string | null
  taskType: TaskType
  provider: string | null
  model: string | null
  inputJson: string
  outputJson: string | null
  status: TaskStatus
  retryCount: number
  jobId: string | null
  upstreamRevision: string
  idempotencyKey: string | null
  lockedBy: string | null
  lockedAt: string | null
  heartbeatAt: string | null
  leaseExpiresAt: string | null
  nextRetryAt: string | null
  timeoutSeconds: number | null
  cancelRequestedAt: string | null
  errorCode: string | null
  errorDetailsJson: string | null
  repairCount: number
  errorMessage: string | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface GenerationJob {
  id: string
  projectId: string
  episodeId: string | null
  jobType: string
  status: string
  totalCount: number
  pendingCount: number
  runningCount: number
  succeededCount: number
  failedCount: number
  skippedCount: number
  progressPercent: number
  estimatedCost: string | null
  cancelRequestedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface Asset {
  id: string
  projectId: string
  assetType: string
  targetType: string
  targetId: string
  generationTaskId: string | null
  url: string
  provider: string | null
  model: string | null
  prompt: string | null
  metadataJson: string
  status: string
  createdAt: string
  updatedAt: string
}

// ── SSE ──────────────────────────────────────────────────────────────────────

/** Per-task lifecycle event pushed over the SSE stream (packages/tasks/task-event.ts). */
export interface TaskEvent {
  taskId: string
  projectId: string
  taskType: TaskType
  status: TaskStatus
  targetType: string | null
  targetId: string | null
  episodeId: string | null
  storyboardId: string | null
  /** Human-readable name of the task's target (e.g. episode title), or null when unresolvable. */
  targetName: string | null
  /** Localized task-type label, derived from taskType (and targetType for image tasks). */
  targetLabel: string
  retryCount: number
  errorMessage: string | null
  updatedAt: string
}

// ── Shared async-start envelope ───────────────────────────────────────────────

/** The 202 body returned by every single-target `start*` generation endpoint. */
export interface StartTaskResult {
  taskId: string
  status: 'pending'
}
