import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  genre: text('genre').notNull().default('drama'),
  targetPlatform: text('target_platform').notNull().default('short_video'),
  visualStyle: text('visual_style').notNull().default('realistic'),
  episodeDuration: integer('episode_duration').notNull().default(60),
  status: text('status').notNull().default('draft'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const batches = sqliteTable(
  'batches',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull().references(() => projects.id),
    batchNo: integer('batch_no').notNull(),
    chapterStartNo: integer('chapter_start_no').notNull(),
    chapterEndNo: integer('chapter_end_no').notNull(),
    episodeStartNo: integer('episode_start_no').notNull(),
    episodeEndNo: integer('episode_end_no').notNull(),
    status: text('status').notNull().default('planned'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    projectBatchNoUnique: uniqueIndex('batches_project_batch_no_unique').on(table.projectId, table.batchNo),
  }),
)

export const episodes = sqliteTable(
  'episodes',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull().references(() => projects.id),
    batchId: text('batch_id').references(() => batches.id),
    episodeNo: integer('episode_no').notNull(),
    title: text('title'),
    summary: text('summary'),
    openingHook: text('opening_hook'),
    endingHook: text('ending_hook'),
    scriptId: text('script_id'),
    videoUrl: text('video_url'),
    status: text('status').notNull().default('draft'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    projectEpisodeNoUnique: uniqueIndex('episodes_project_episode_no_unique').on(table.projectId, table.episodeNo),
    batchIdIdx: index('episodes_batch_id_idx').on(table.batchId),
  }),
)

export const scripts = sqliteTable(
  'scripts',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull().references(() => projects.id),
    episodeId: text('episode_id').notNull().references(() => episodes.id),
    title: text('title').notNull(),
    summary: text('summary').notNull(),
    openingHook: text('opening_hook'),
    endingHook: text('ending_hook'),
    content: text('content').notNull(),
    structuredJson: text('structured_json').notNull(),
    status: text('status').notNull().default('draft'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    episodeUnique: uniqueIndex('scripts_episode_id_unique').on(table.episodeId),
  }),
)

export const novelChapters = sqliteTable('novel_chapters', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  chapterNo: integer('chapter_no').notNull(),
  title: text('title'),
  content: text('content').notNull(),
  wordCount: integer('word_count').notNull().default(0),
  source: text('source'),
  status: text('status').notNull().default('pending'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const novelEvents = sqliteTable(
  'novel_events',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull().references(() => projects.id),
    chapterId: text('chapter_id').notNull().references(() => novelChapters.id),
    eventNo: integer('event_no').notNull(),
    eventType: text('event_type').notNull(),
    summary: text('summary').notNull(),
    detail: text('detail').notNull(),
    charactersJson: text('characters_json').notNull().default('[]'),
    location: text('location'),
    timeHint: text('time_hint'),
    emotionTone: text('emotion_tone'),
    conflictLevel: text('conflict_level').notNull().default('none'),
    importance: text('importance').notNull().default('minor'),
    sourceTextRangeJson: text('source_text_range_json'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    chapterEventNoUnique: uniqueIndex('novel_events_chapter_event_no_unique').on(table.chapterId, table.eventNo),
  }),
)

export const episodeEventLinks = sqliteTable(
  'episode_event_links',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull().references(() => projects.id),
    episodeId: text('episode_id').notNull().references(() => episodes.id),
    novelEventId: text('novel_event_id').notNull().references(() => novelEvents.id),
    orderInEpisode: integer('order_in_episode').notNull(),
    usageType: text('usage_type').notNull().default('primary'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    episodeOrderUnique: uniqueIndex('episode_event_links_episode_order_unique').on(
      table.episodeId,
      table.orderInEpisode,
    ),
    novelEventUnique: uniqueIndex('episode_event_links_novel_event_unique').on(table.novelEventId),
  }),
)

export const characters = sqliteTable(
  'characters',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull().references(() => projects.id),
    name: text('name').notNull(),
    aliasJson: text('alias_json').notNull().default('[]'),
    role: text('role'),
    age: text('age'),
    gender: text('gender'),
    appearance: text('appearance'),
    personality: text('personality'),
    background: text('background'),
    relationshipJson: text('relationship_json').notNull().default('[]'),
    referenceImageUrl: text('reference_image_url'),
    voiceId: text('voice_id'),
    status: text('status').notNull().default('active'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    projectNameUnique: uniqueIndex('characters_project_name_unique').on(table.projectId, table.name),
  }),
)

export const characterAppearanceVersions = sqliteTable(
  'character_appearance_versions',
  {
    id: text('id').primaryKey(),
    characterId: text('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    // Auto-detected versions: the extracting episode; effective episode number is
    // resolved at query time by joining episodes so batch re-plan renumbering is followed.
    sourceEpisodeId: text('source_episode_id').references(() => episodes.id, { onDelete: 'cascade' }),
    // Manual versions only: explicit effective episode number. XOR with sourceEpisodeId,
    // enforced at the service layer.
    effectiveFromEpisodeNo: integer('effective_from_episode_no'),
    appearance: text('appearance').notNull(),
    referenceImageUrl: text('reference_image_url'),
    changeReason: text('change_reason'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    characterSourceEpisodeUnique: uniqueIndex('cav_character_source_episode_unique')
      .on(table.characterId, table.sourceEpisodeId)
      .where(sql`source_episode_id IS NOT NULL`),
    characterEffectiveFromUnique: uniqueIndex('cav_character_effective_from_unique')
      .on(table.characterId, table.effectiveFromEpisodeNo)
      .where(sql`effective_from_episode_no IS NOT NULL`),
    characterIdIdx: index('cav_character_id_idx').on(table.characterId),
  }),
)

export const scenes = sqliteTable(
  'scenes',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull().references(() => projects.id),
    name: text('name').notNull(),
    description: text('description'),
    locationType: text('location_type'),
    visualStyle: text('visual_style'),
    visualPrompt: text('visual_prompt'),
    referenceImageUrl: text('reference_image_url'),
    status: text('status').notNull().default('active'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    projectNameUnique: uniqueIndex('scenes_project_name_unique').on(table.projectId, table.name),
  }),
)

export const props = sqliteTable(
  'props',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull().references(() => projects.id),
    name: text('name').notNull(),
    description: text('description'),
    significance: text('significance'),
    visualPrompt: text('visual_prompt'),
    referenceImageUrl: text('reference_image_url'),
    status: text('status').notNull().default('active'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    projectNameUnique: uniqueIndex('props_project_name_unique').on(table.projectId, table.name),
  }),
)

export const episodeCharacterLinks = sqliteTable(
  'episode_character_links',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull().references(() => projects.id),
    episodeId: text('episode_id').notNull().references(() => episodes.id),
    characterId: text('character_id').notNull().references(() => characters.id),
    usageType: text('usage_type').notNull().default('mentioned'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    episodeCharacterUnique: uniqueIndex('episode_character_links_episode_character_unique').on(
      table.episodeId,
      table.characterId,
    ),
  }),
)

export const episodeSceneLinks = sqliteTable(
  'episode_scene_links',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull().references(() => projects.id),
    episodeId: text('episode_id').notNull().references(() => episodes.id),
    sceneId: text('scene_id').notNull().references(() => scenes.id),
    usageType: text('usage_type').notNull().default('used'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    episodeSceneUnique: uniqueIndex('episode_scene_links_episode_scene_unique').on(table.episodeId, table.sceneId),
  }),
)

export const episodePropLinks = sqliteTable(
  'episode_prop_links',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull().references(() => projects.id),
    episodeId: text('episode_id').notNull().references(() => episodes.id),
    propId: text('prop_id').notNull().references(() => props.id),
    usageType: text('usage_type').notNull().default('used'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    episodePropUnique: uniqueIndex('episode_prop_links_episode_prop_unique').on(table.episodeId, table.propId),
  }),
)

export const storyboards = sqliteTable(
  'storyboards',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull().references(() => projects.id),
    episodeId: text('episode_id').notNull().references(() => episodes.id),
    shotNo: integer('shot_no').notNull(),
    duration: integer('duration').notNull(),
    sceneId: text('scene_id').references(() => scenes.id),
    characterIdsJson: text('character_ids_json').notNull().default('[]'),
    propIdsJson: text('prop_ids_json').notNull().default('[]'),
    scriptSectionNo: integer('script_section_no'),
    shotType: text('shot_type').notNull(),
    cameraAngle: text('camera_angle'),
    cameraMovement: text('camera_movement'),
    action: text('action').notNull(),
    dialogueJson: text('dialogue_json').notNull().default('[]'),
    narration: text('narration'),
    emotion: text('emotion'),
    imagePrompt: text('image_prompt').notNull(),
    videoPrompt: text('video_prompt').notNull(),
    firstFrameImageUrl: text('first_frame_image_url'),
    lastFrameImageUrl: text('last_frame_image_url'),
    videoUrl: text('video_url'),
    ttsAudioUrl: text('tts_audio_url'),
    subtitleUrl: text('subtitle_url'),
    composedVideoUrl: text('composed_video_url'),
    status: text('status').notNull().default('draft'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    episodeShotNoUnique: uniqueIndex('storyboards_episode_shot_no_unique').on(table.episodeId, table.shotNo),
  }),
)

export const agentRuns = sqliteTable('agent_runs', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  episodeId: text('episode_id'),
  agentType: text('agent_type').notNull(),
  skillName: text('skill_name').notNull(),
  skillVersion: text('skill_version').notNull(),
  model: text('model'),
  inputJson: text('input_json').notNull(),
  outputJson: text('output_json'),
  status: text('status').notNull(),
  errorMessage: text('error_message'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const generationTasks = sqliteTable('generation_tasks', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  episodeId: text('episode_id'),
  storyboardId: text('storyboard_id'),
  targetType: text('target_type'),
  targetId: text('target_id'),
  taskType: text('task_type').notNull(),
  provider: text('provider'),
  model: text('model'),
  inputJson: text('input_json').notNull(),
  outputJson: text('output_json'),
  status: text('status').notNull(),
  retryCount: integer('retry_count').notNull().default(0),
  /** Parent record for a user-initiated batch; null for a standalone task. */
  jobId: text('job_id'),
  /** Revision of the upstream data this task is allowed to consume/write. */
  upstreamRevision: text('upstream_revision').notNull().default('0'),
  /** Stable key used by services to reuse an active/effective request. */
  idempotencyKey: text('idempotency_key'),
  lockedBy: text('locked_by'),
  lockedAt: text('locked_at'),
  heartbeatAt: text('heartbeat_at'),
  leaseExpiresAt: text('lease_expires_at'),
  nextRetryAt: text('next_retry_at'),
  timeoutSeconds: integer('timeout_seconds'),
  cancelRequestedAt: text('cancel_requested_at'),
  errorCode: text('error_code'),
  errorDetailsJson: text('error_details_json'),
  repairCount: integer('repair_count').notNull().default(0),
  errorMessage: text('error_message'),
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  claimIdx: index('generation_tasks_claim_idx').on(table.status, table.nextRetryAt, table.createdAt),
  leaseIdx: index('generation_tasks_lease_idx').on(table.status, table.leaseExpiresAt),
  idempotencyIdx: index('generation_tasks_idempotency_idx').on(table.idempotencyKey),
  jobIdx: index('generation_tasks_job_idx').on(table.jobId),
}))

/** Persisted aggregate for an asynchronous batch operation. */
export const generationJobs = sqliteTable('generation_jobs', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  episodeId: text('episode_id'),
  jobType: text('job_type').notNull(),
  status: text('status').notNull().default('pending'),
  totalCount: integer('total_count').notNull().default(0),
  pendingCount: integer('pending_count').notNull().default(0),
  runningCount: integer('running_count').notNull().default(0),
  succeededCount: integer('succeeded_count').notNull().default(0),
  failedCount: integer('failed_count').notNull().default(0),
  skippedCount: integer('skipped_count').notNull().default(0),
  progressPercent: integer('progress_percent').notNull().default(0),
  estimatedCost: text('estimated_cost'),
  cancelRequestedAt: text('cancel_requested_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  projectCreatedIdx: index('generation_jobs_project_created_idx').on(table.projectId, table.createdAt),
}))

/** Active production revisions and invalidation facts for one episode. */
export const episodePipelineStates = sqliteTable('episode_pipeline_states', {
  episodeId: text('episode_id').primaryKey().references(() => episodes.id, { onDelete: 'cascade' }),
  planningRevision: integer('planning_revision').notNull().default(1),
  scriptRevision: integer('script_revision').notNull().default(0),
  assetRevision: integer('asset_revision').notNull().default(0),
  storyboardRevision: integer('storyboard_revision').notNull().default(0),
  imageRevision: integer('image_revision').notNull().default(0),
  assetsStale: integer('assets_stale', { mode: 'boolean' }).notNull().default(false),
  storyboardsStale: integer('storyboards_stale', { mode: 'boolean' }).notNull().default(false),
  imagesStale: integer('images_stale', { mode: 'boolean' }).notNull().default(false),
  updatedAt: text('updated_at').notNull(),
})

export const assets = sqliteTable('assets', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  assetType: text('asset_type').notNull(),
  targetType: text('target_type').notNull(),
  targetId: text('target_id').notNull(),
  generationTaskId: text('generation_task_id').references(() => generationTasks.id),
  url: text('url').notNull(),
  provider: text('provider'),
  model: text('model'),
  prompt: text('prompt'),
  metadataJson: text('metadata_json').notNull().default('{}'),
  status: text('status').notNull().default('active'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const schema = {
  projects,
  batches,
  episodes,
  scripts,
  novelChapters,
  novelEvents,
  episodeEventLinks,
  characters,
  characterAppearanceVersions,
  scenes,
  props,
  episodeCharacterLinks,
  episodeSceneLinks,
  episodePropLinks,
  storyboards,
  agentRuns,
  generationTasks,
  generationJobs,
  episodePipelineStates,
  assets,
}

export type Project = typeof projects.$inferSelect
export type Batch = typeof batches.$inferSelect
export type Episode = typeof episodes.$inferSelect
export type Script = typeof scripts.$inferSelect
export type NovelChapter = typeof novelChapters.$inferSelect
export type NovelEvent = typeof novelEvents.$inferSelect
export type EpisodeEventLink = typeof episodeEventLinks.$inferSelect
export type Character = typeof characters.$inferSelect
export type CharacterAppearanceVersion = typeof characterAppearanceVersions.$inferSelect
export type Scene = typeof scenes.$inferSelect
export type Prop = typeof props.$inferSelect
export type EpisodeCharacterLink = typeof episodeCharacterLinks.$inferSelect
export type EpisodeSceneLink = typeof episodeSceneLinks.$inferSelect
export type EpisodePropLink = typeof episodePropLinks.$inferSelect
export type Storyboard = typeof storyboards.$inferSelect
export type AgentRun = typeof agentRuns.$inferSelect
export type GenerationTask = typeof generationTasks.$inferSelect
export type GenerationJob = typeof generationJobs.$inferSelect
export type EpisodePipelineState = typeof episodePipelineStates.$inferSelect
export type Asset = typeof assets.$inferSelect
