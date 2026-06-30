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

export const episodes = sqliteTable('episodes', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  episodeNo: integer('episode_no').notNull(),
  title: text('title'),
  summary: text('summary'),
  scriptId: text('script_id'),
  videoUrl: text('video_url'),
  status: text('status').notNull().default('draft'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

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

export const episodeEventLinks = sqliteTable('episode_event_links', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  episodeId: text('episode_id').notNull().references(() => episodes.id),
  eventId: text('event_id').notNull().references(() => novelEvents.id),
  orderNo: integer('order_no').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

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

export const schema = {
  projects,
  episodes,
  novelChapters,
  novelEvents,
  episodeEventLinks,
  agentRuns,
  generationTasks,
}

export type Project = typeof projects.$inferSelect
export type NovelChapter = typeof novelChapters.$inferSelect
export type NovelEvent = typeof novelEvents.$inferSelect
export type AgentRun = typeof agentRuns.$inferSelect
export type GenerationTask = typeof generationTasks.$inferSelect
