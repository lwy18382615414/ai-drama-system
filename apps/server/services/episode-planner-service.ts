import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { z } from 'zod/v4'
import type { DatabaseClient } from '../../../packages/database/index.js'
import {
  episodeEventLinks,
  episodes,
  generationTasks,
  novelChapters,
  novelEvents,
  projects,
} from '../../../packages/database/index.js'
import {
  EpisodePlannerOptionsSchema,
  type EpisodePlannerInput,
  runEpisodePlannerAgent,
} from '../../../packages/agents/episode-planner-agent/index.js'
import type { StructuredTextProvider } from '../../../packages/providers/index.js'

export const StartEpisodePlanningRequestSchema = z
  .object({
    chapterIds: z.array(z.string().min(1)).min(1).optional(),
    chapter_ids: z.array(z.string().min(1)).min(1).optional(),
    options: EpisodePlannerOptionsSchema.optional(),
  })
  .transform((request) => ({
    chapterIds: request.chapterIds ?? request.chapter_ids,
    options: request.options,
  }))

export type StartEpisodePlanningRequest = z.infer<typeof StartEpisodePlanningRequestSchema>

export class EpisodePlannerServiceError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message)
  }
}

export interface EpisodePlannerServiceDeps {
  db: DatabaseClient
  provider: StructuredTextProvider
}

export async function startEpisodePlanning(
  deps: EpisodePlannerServiceDeps,
  projectId: string,
  request: StartEpisodePlanningRequest,
) {
  const now = new Date().toISOString()
  const input = await buildEpisodePlannerInput(deps.db, projectId, request)
  const taskId = nanoid()

  await deps.db.insert(generationTasks).values({
    id: taskId,
    projectId,
    episodeId: null,
    storyboardId: null,
    taskType: 'episode_planning',
    provider: deps.provider.name,
    model: input.options?.model ?? deps.provider.model,
    inputJson: JSON.stringify({ ...input, taskId }),
    outputJson: null,
    status: 'pending',
    retryCount: 0,
    errorMessage: null,
    startedAt: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  })

  setTimeout(() => {
    void runEpisodePlannerAgent({
      db: deps.db,
      provider: deps.provider,
      input: {
        ...input,
        taskId,
      },
    })
  }, 0)

  return { taskId, status: 'pending' as const }
}

export async function getProjectEpisodes(db: DatabaseClient, projectId: string) {
  const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).limit(1)

  if (!project) {
    return null
  }

  return db.select().from(episodes).where(eq(episodes.projectId, projectId)).orderBy(episodes.episodeNo)
}

export async function getEpisodeEvents(db: DatabaseClient, episodeId: string) {
  const [episode] = await db.select().from(episodes).where(eq(episodes.id, episodeId)).limit(1)

  if (!episode) {
    return null
  }

  const events = await db
    .select({
      linkId: episodeEventLinks.id,
      projectId: episodeEventLinks.projectId,
      episodeId: episodeEventLinks.episodeId,
      novelEventId: episodeEventLinks.novelEventId,
      orderInEpisode: episodeEventLinks.orderInEpisode,
      usageType: episodeEventLinks.usageType,
      event: novelEvents,
    })
    .from(episodeEventLinks)
    .innerJoin(novelEvents, eq(episodeEventLinks.novelEventId, novelEvents.id))
    .where(eq(episodeEventLinks.episodeId, episodeId))
    .orderBy(episodeEventLinks.orderInEpisode)

  return { episode, events }
}

async function buildEpisodePlannerInput(
  db: DatabaseClient,
  projectId: string,
  request: StartEpisodePlanningRequest,
): Promise<EpisodePlannerInput> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1)

  if (!project) {
    throw new EpisodePlannerServiceError(`Project not found: ${projectId}`, 404)
  }

  const existingEpisodes = await db.select({ id: episodes.id }).from(episodes).where(eq(episodes.projectId, projectId)).limit(1)

  if (existingEpisodes.length > 0) {
    throw new EpisodePlannerServiceError(`Project already has episodes: ${projectId}`, 409)
  }

  const allChapters = await db
    .select()
    .from(novelChapters)
    .where(eq(novelChapters.projectId, projectId))
    .orderBy(novelChapters.chapterNo)

  if (allChapters.length === 0) {
    throw new EpisodePlannerServiceError(`Project has no novel chapters: ${projectId}`, 400)
  }

  const requestedChapterIds = request.chapterIds ?? allChapters.map((chapter) => chapter.id)
  const chapterById = new Map(allChapters.map((chapter) => [chapter.id, chapter]))
  const missingChapterId = requestedChapterIds.find((chapterId) => !chapterById.has(chapterId))

  if (missingChapterId) {
    throw new EpisodePlannerServiceError(`Novel chapter not found for project: ${missingChapterId}`, 400)
  }

  const selectedChapterIds = new Set(requestedChapterIds)
  const projectEvents = await db
    .select()
    .from(novelEvents)
    .where(eq(novelEvents.projectId, projectId))
    .orderBy(novelEvents.eventNo)

  const sourceEvents = projectEvents
    .filter((event) => selectedChapterIds.has(event.chapterId))
    .map((event) => {
      const chapter = chapterById.get(event.chapterId)

      if (!chapter) {
        throw new EpisodePlannerServiceError(`Novel event references an unknown chapter: ${event.id}`, 400)
      }

      return {
        id: event.id,
        projectId: event.projectId,
        chapterId: event.chapterId,
        chapterNo: chapter.chapterNo,
        eventNo: event.eventNo,
        eventType: event.eventType,
        summary: event.summary,
        detail: event.detail,
        characters: parseCharacters(event.charactersJson),
        location: event.location,
        timeHint: event.timeHint,
        emotionTone: event.emotionTone,
        conflictLevel: event.conflictLevel,
        importance: event.importance,
      }
    })
    .sort((a, b) => a.chapterNo - b.chapterNo || a.eventNo - b.eventNo)

  if (sourceEvents.length === 0) {
    throw new EpisodePlannerServiceError('Episode planning requires at least one novel event', 400)
  }

  return {
    projectId,
    chapterIds: requestedChapterIds,
    novelEvents: sourceEvents,
    styleConfig: {
      title: project.title,
      genre: project.genre,
      targetPlatform: project.targetPlatform,
      visualStyle: project.visualStyle,
      episodeDuration: project.episodeDuration,
    },
    options: request.options,
  }
}

function parseCharacters(charactersJson: string) {
  try {
    const parsed = JSON.parse(charactersJson)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}
