import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

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

export const episodes = sqliteTable(
  'episodes',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull().references(() => projects.id),
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
  errorMessage: text('error_message'),
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
  createdAt: text('created_at').notNull(),
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
  episodes,
  scripts,
  novelChapters,
  novelEvents,
  episodeEventLinks,
  characters,
  scenes,
  props,
  episodeCharacterLinks,
  episodeSceneLinks,
  episodePropLinks,
  storyboards,
  agentRuns,
  generationTasks,
  assets,
}

export type Project = typeof projects.$inferSelect
export type Episode = typeof episodes.$inferSelect
export type Script = typeof scripts.$inferSelect
export type NovelChapter = typeof novelChapters.$inferSelect
export type NovelEvent = typeof novelEvents.$inferSelect
export type EpisodeEventLink = typeof episodeEventLinks.$inferSelect
export type Character = typeof characters.$inferSelect
export type Scene = typeof scenes.$inferSelect
export type Prop = typeof props.$inferSelect
export type EpisodeCharacterLink = typeof episodeCharacterLinks.$inferSelect
export type EpisodeSceneLink = typeof episodeSceneLinks.$inferSelect
export type EpisodePropLink = typeof episodePropLinks.$inferSelect
export type Storyboard = typeof storyboards.$inferSelect
export type AgentRun = typeof agentRuns.$inferSelect
export type GenerationTask = typeof generationTasks.$inferSelect
export type Asset = typeof assets.$inferSelect
