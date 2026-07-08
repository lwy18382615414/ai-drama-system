import { and, eq, inArray, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { z } from 'zod/v4'
import {
  NovelMetaSchema,
  ProjectProfileAgentOptionsSchema,
} from '../../../packages/agents/index.js'
import type { DatabaseClient } from '../../../packages/database/index.js'
import {
  agentRuns,
  assets,
  batches,
  characters,
  episodeCharacterLinks,
  episodeEventLinks,
  episodePropLinks,
  episodeSceneLinks,
  episodes,
  generationTasks,
  novelChapters,
  novelEvents,
  projects,
  props,
  scenes,
  scripts,
  storyboards,
} from '../../../packages/database/index.js'
import type { StructuredTextProvider } from '../../../packages/providers/index.js'
import type { TaskScheduler } from '../../../packages/tasks/index.js'
import { countWords } from './novel-splitter.js'

export class ProjectServiceError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message)
  }
}

export const CreateProjectRequestSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  genre: z.string().min(1).optional(),
  targetPlatform: z.string().min(1).optional(),
  visualStyle: z.string().min(1).optional(),
  episodeDuration: z.number().int().positive().optional(),
})

export type CreateProjectRequest = z.infer<typeof CreateProjectRequestSchema>

export const UpdateProjectRequestSchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    genre: z.string().min(1).optional(),
    targetPlatform: z.string().min(1).optional(),
    visualStyle: z.string().min(1).optional(),
    episodeDuration: z.number().int().positive().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Project update requires at least one field',
  })

export type UpdateProjectRequest = z.infer<typeof UpdateProjectRequestSchema>

/**
 * Aggregate image-completion percentage for a project: completed image assets over
 * the expected image targets (characters + scenes + storyboards). Returns 0 when
 * there is nothing to generate yet so the UI can render an empty progress bar.
 */
function imageCompletion(completedImages: number, characterCount: number, sceneCount: number, storyboardCount: number) {
  const expected = characterCount + sceneCount + storyboardCount
  if (expected === 0) return 0
  return Math.round((Math.min(completedImages, expected) / expected) * 100)
}

async function groupedCounts(
  builder: () => Promise<{ projectId: string; count: unknown }[]>,
): Promise<Map<string, number>> {
  const rows = await builder()
  return new Map(rows.map((row) => [row.projectId, Number(row.count)]))
}

async function countByTable(
  db: DatabaseClient,
  table: typeof episodes | typeof storyboards | typeof characters | typeof scenes | typeof novelChapters | typeof scripts,
  projectIds: string[],
) {
  if (projectIds.length === 0) return new Map<string, number>()
  return groupedCounts(() =>
    db
      .select({ projectId: table.projectId, count: sql<number>`count(*)` })
      .from(table)
      .where(inArray(table.projectId, projectIds))
      .groupBy(table.projectId),
  )
}

export interface ProjectSummary {
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
  chapterCount: number
  episodeCount: number
  scriptCount: number
  storyboardCount: number
  /** Number of distinct episodes that have at least one storyboard shot — the "分镜" stage denominator. */
  storyboardEpisodeCount: number
  characterCount: number
  sceneCount: number
  imageCompletion: number
}

export async function listProjects(db: DatabaseClient): Promise<ProjectSummary[]> {
  const rows = await db.select().from(projects).orderBy(sql`${projects.createdAt} desc`)
  const ids = rows.map((project) => project.id)

  const [
    chapterCounts,
    episodeCounts,
    scriptCounts,
    storyboardCounts,
    storyboardEpisodeCounts,
    characterCounts,
    sceneCounts,
    imageCounts,
  ] = await Promise.all([
    countByTable(db, novelChapters, ids),
    countByTable(db, episodes, ids),
    countByTable(db, scripts, ids),
    countByTable(db, storyboards, ids),
    ids.length === 0
      ? Promise.resolve(new Map<string, number>())
      : groupedCounts(() =>
          db
            .select({ projectId: storyboards.projectId, count: sql<number>`count(distinct ${storyboards.episodeId})` })
            .from(storyboards)
            .where(inArray(storyboards.projectId, ids))
            .groupBy(storyboards.projectId),
        ),
    countByTable(db, characters, ids),
    countByTable(db, scenes, ids),
    ids.length === 0
      ? Promise.resolve(new Map<string, number>())
      : groupedCounts(() =>
          db
            .select({ projectId: assets.projectId, count: sql<number>`count(*)` })
            .from(assets)
            .where(inArray(assets.projectId, ids))
            .groupBy(assets.projectId),
        ),
  ])

  return rows.map((project) => {
    const chapterCount = chapterCounts.get(project.id) ?? 0
    const episodeCount = episodeCounts.get(project.id) ?? 0
    const scriptCount = scriptCounts.get(project.id) ?? 0
    const storyboardCount = storyboardCounts.get(project.id) ?? 0
    const storyboardEpisodeCount = storyboardEpisodeCounts.get(project.id) ?? 0
    const characterCount = characterCounts.get(project.id) ?? 0
    const sceneCount = sceneCounts.get(project.id) ?? 0
    const completedImages = imageCounts.get(project.id) ?? 0

    return {
      ...project,
      chapterCount,
      episodeCount,
      scriptCount,
      storyboardCount,
      storyboardEpisodeCount,
      characterCount,
      sceneCount,
      imageCompletion: imageCompletion(completedImages, characterCount, sceneCount, storyboardCount),
    }
  })
}

export interface ProjectDetail extends ProjectSummary {
  eventCount: number
  propCount: number
  completedImages: number
  batchCount: number
  extractedChapterCount: number
  plannedChapterEndNo: number
}

async function countFor(builder: () => Promise<{ count: unknown }[]>): Promise<number> {
  const rows = await builder()
  return Number(rows[0]?.count ?? 0)
}

export async function getProjectChapters(db: DatabaseClient, projectId: string) {
  const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).limit(1)
  if (!project) return null

  const chapters = await db
    .select()
    .from(novelChapters)
    .where(eq(novelChapters.projectId, projectId))
    .orderBy(novelChapters.chapterNo)

  return { project, chapters }
}

export async function getProjectDetail(db: DatabaseClient, projectId: string): Promise<ProjectDetail | null> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1)
  if (!project) return null

  const [
    chapterCount,
    eventCount,
    episodeCount,
    characterCount,
    sceneCount,
    propCount,
    storyboardCount,
    storyboardEpisodeCount,
    scriptCount,
    completedImages,
    batchCount,
    extractedChapterCount,
    plannedChapterEndNo,
  ] = await Promise.all([
    countFor(() =>
      db
        .select({ count: sql<number>`count(*)` })
        .from(novelChapters)
        .where(eq(novelChapters.projectId, projectId)),
    ),
    countFor(() =>
      db
        .select({ count: sql<number>`count(*)` })
        .from(novelEvents)
        .where(eq(novelEvents.projectId, projectId)),
    ),
    countFor(() =>
      db
        .select({ count: sql<number>`count(*)` })
        .from(episodes)
        .where(eq(episodes.projectId, projectId)),
    ),
    countFor(() =>
      db
        .select({ count: sql<number>`count(*)` })
        .from(characters)
        .where(eq(characters.projectId, projectId)),
    ),
    countFor(() =>
      db
        .select({ count: sql<number>`count(*)` })
        .from(scenes)
        .where(eq(scenes.projectId, projectId)),
    ),
    countFor(() =>
      db
        .select({ count: sql<number>`count(*)` })
        .from(props)
        .where(eq(props.projectId, projectId)),
    ),
    countFor(() =>
      db
        .select({ count: sql<number>`count(*)` })
        .from(storyboards)
        .where(eq(storyboards.projectId, projectId)),
    ),
    countFor(() =>
      db
        .select({ count: sql<number>`count(distinct ${storyboards.episodeId})` })
        .from(storyboards)
        .where(eq(storyboards.projectId, projectId)),
    ),
    countFor(() =>
      db
        .select({ count: sql<number>`count(*)` })
        .from(scripts)
        .where(eq(scripts.projectId, projectId)),
    ),
    countFor(() =>
      db
        .select({ count: sql<number>`count(*)` })
        .from(assets)
        .where(eq(assets.projectId, projectId)),
    ),
    countFor(() =>
      db
        .select({ count: sql<number>`count(*)` })
        .from(batches)
        .where(eq(batches.projectId, projectId)),
    ),
    countFor(() =>
      db
        .select({ count: sql<number>`count(*)` })
        .from(novelChapters)
        .where(and(eq(novelChapters.projectId, projectId), eq(novelChapters.status, 'event_extracted'))),
    ),
    // Highest chapter number already planned into a batch (0 when none).
    countFor(() =>
      db
        .select({ count: sql<number>`coalesce(max(${batches.chapterEndNo}), 0)` })
        .from(batches)
        .where(eq(batches.projectId, projectId)),
    ),
  ])

  return {
    ...project,
    chapterCount,
    eventCount,
    episodeCount,
    characterCount,
    sceneCount,
    propCount,
    storyboardCount,
    storyboardEpisodeCount,
    scriptCount,
    completedImages,
    batchCount,
    extractedChapterCount,
    plannedChapterEndNo,
    imageCompletion: imageCompletion(completedImages, characterCount, sceneCount, storyboardCount),
  }
}

export async function createProject(db: DatabaseClient, request: CreateProjectRequest) {
  const now = new Date().toISOString()
  const id = nanoid()

  const values = {
    id,
    title: request.title,
    description: request.description ?? null,
    genre: request.genre ?? 'drama',
    targetPlatform: request.targetPlatform ?? 'short_video',
    visualStyle: request.visualStyle ?? 'realistic',
    episodeDuration: request.episodeDuration ?? 60,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  }

  await db.insert(projects).values(values)

  return values
}

export const CreateProjectFromNovelRequestSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  source: z.enum(['paste', 'txt', 'epub']),
  chapters: z
    .array(
      z.object({
        title: z.string().max(200).nullable(),
        content: z.string().min(1),
      }),
    )
    .min(1)
    .max(1000),
  novelMeta: NovelMetaSchema.optional(),
  options: ProjectProfileAgentOptionsSchema.optional(),
})

export type CreateProjectFromNovelRequest = z.infer<typeof CreateProjectFromNovelRequestSchema>

export interface CreateProjectFromNovelDeps {
  db: DatabaseClient
  provider: StructuredTextProvider
  scheduler: TaskScheduler
}

/**
 * Novel-driven project creation: inserts a draft project, imports its chapters,
 * and records a pending `project_profile` task in one transaction, then kicks
 * off ProjectProfileAgent in the background. The frontend polls the returned
 * task and applies the confirmed profile via PATCH /api/projects/:id.
 */
export async function createProjectFromNovel(deps: CreateProjectFromNovelDeps, request: CreateProjectFromNovelRequest) {
  const now = new Date().toISOString()
  const projectId = nanoid()
  const taskId = nanoid()

  const project = {
    id: projectId,
    title: request.title ?? request.novelMeta?.title ?? '未命名项目',
    description: null,
    genre: 'drama',
    targetPlatform: 'short_video',
    visualStyle: 'realistic',
    episodeDuration: 60,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  }

  const chapterRows = request.chapters.map((chapter, index) => ({
    id: nanoid(),
    projectId,
    chapterNo: index + 1,
    title: chapter.title,
    content: chapter.content,
    wordCount: countWords(chapter.content),
    source: request.source,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  }))

  const agentInput = {
    projectId,
    taskId,
    novelMeta: request.novelMeta,
    options: request.options,
  }

  await deps.db.transaction(async (tx) => {
    await tx.insert(projects).values(project)
    await tx.insert(novelChapters).values(chapterRows)
    await tx.insert(generationTasks).values({
      id: taskId,
      projectId,
      episodeId: null,
      storyboardId: null,
      taskType: 'project_profile',
      provider: deps.provider.name,
      model: request.options?.model ?? deps.provider.model,
      inputJson: JSON.stringify(agentInput),
      outputJson: null,
      status: 'pending',
      retryCount: 0,
      errorMessage: null,
      startedAt: null,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    })
  })

  void deps.scheduler.announce(taskId)
  deps.scheduler.notify()

  return { project, chapters: chapterRows, taskId, taskStatus: 'pending' as const }
}

/** Deletes a project and every dependent row. SQLite FKs here have no ON DELETE CASCADE, so cascade manually. */
export async function deleteProject(db: DatabaseClient, projectId: string) {
  const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).limit(1)

  if (!project) {
    throw new ProjectServiceError(`Project not found: ${projectId}`, 404)
  }

  await db.transaction(async (tx) => {
    await tx.delete(assets).where(eq(assets.projectId, projectId))
    await tx.delete(generationTasks).where(eq(generationTasks.projectId, projectId))
    await tx.delete(agentRuns).where(eq(agentRuns.projectId, projectId))
    await tx.delete(storyboards).where(eq(storyboards.projectId, projectId))
    await tx.delete(episodePropLinks).where(eq(episodePropLinks.projectId, projectId))
    await tx.delete(episodeSceneLinks).where(eq(episodeSceneLinks.projectId, projectId))
    await tx.delete(episodeCharacterLinks).where(eq(episodeCharacterLinks.projectId, projectId))
    await tx.delete(episodeEventLinks).where(eq(episodeEventLinks.projectId, projectId))
    await tx.delete(props).where(eq(props.projectId, projectId))
    await tx.delete(scenes).where(eq(scenes.projectId, projectId))
    await tx.delete(characters).where(eq(characters.projectId, projectId))
    await tx.delete(scripts).where(eq(scripts.projectId, projectId))
    await tx.delete(episodes).where(eq(episodes.projectId, projectId))
    await tx.delete(batches).where(eq(batches.projectId, projectId))
    await tx.delete(novelEvents).where(eq(novelEvents.projectId, projectId))
    await tx.delete(novelChapters).where(eq(novelChapters.projectId, projectId))
    await tx.delete(projects).where(eq(projects.id, projectId))
  })
}

export async function updateProject(
  db: DatabaseClient,
  projectId: string,
  request: UpdateProjectRequest,
): Promise<ProjectDetail> {
  const existing = await getProjectDetail(db, projectId)

  if (!existing) {
    throw new ProjectServiceError(`Project not found: ${projectId}`, 404)
  }

  const updates: Partial<typeof projects.$inferInsert> = {
    updatedAt: new Date().toISOString(),
  }

  if (request.title !== undefined) updates.title = request.title
  if (request.description !== undefined) updates.description = request.description
  if (request.genre !== undefined) updates.genre = request.genre
  if (request.targetPlatform !== undefined) updates.targetPlatform = request.targetPlatform
  if (request.visualStyle !== undefined) updates.visualStyle = request.visualStyle
  if (request.episodeDuration !== undefined) updates.episodeDuration = request.episodeDuration

  await db.update(projects).set(updates).where(eq(projects.id, projectId))

  const updated = await getProjectDetail(db, projectId)
  if (!updated) {
    throw new ProjectServiceError(`Project not found: ${projectId}`, 404)
  }

  return updated
}
