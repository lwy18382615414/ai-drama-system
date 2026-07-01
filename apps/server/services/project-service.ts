import { eq, inArray, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import type { DatabaseClient } from '../../../packages/database/index.js'
import {
  assets,
  characters,
  episodes,
  novelChapters,
  novelEvents,
  projects,
  props,
  scenes,
  scripts,
  storyboards,
} from '../../../packages/database/index.js'

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
  table: typeof episodes | typeof storyboards | typeof characters | typeof scenes,
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
  episodeCount: number
  storyboardCount: number
  characterCount: number
  sceneCount: number
  imageCompletion: number
}

export async function listProjects(db: DatabaseClient): Promise<ProjectSummary[]> {
  const rows = await db.select().from(projects).orderBy(sql`${projects.createdAt} desc`)
  const ids = rows.map((project) => project.id)

  const [episodeCounts, storyboardCounts, characterCounts, sceneCounts, imageCounts] = await Promise.all([
    countByTable(db, episodes, ids),
    countByTable(db, storyboards, ids),
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
    const episodeCount = episodeCounts.get(project.id) ?? 0
    const storyboardCount = storyboardCounts.get(project.id) ?? 0
    const characterCount = characterCounts.get(project.id) ?? 0
    const sceneCount = sceneCounts.get(project.id) ?? 0
    const completedImages = imageCounts.get(project.id) ?? 0

    return {
      ...project,
      episodeCount,
      storyboardCount,
      characterCount,
      sceneCount,
      imageCompletion: imageCompletion(completedImages, characterCount, sceneCount, storyboardCount),
    }
  })
}

export interface ProjectDetail extends ProjectSummary {
  chapterCount: number
  eventCount: number
  propCount: number
  scriptCount: number
  completedImages: number
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
    scriptCount,
    completedImages,
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
    scriptCount,
    completedImages,
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
