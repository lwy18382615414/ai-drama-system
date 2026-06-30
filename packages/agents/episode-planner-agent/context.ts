import { eq } from 'drizzle-orm'
import type { DatabaseClient, Episode, NovelChapter, Project } from '../../database/index.js'
import { episodes, novelChapters, novelEvents, projects } from '../../database/index.js'
import type { EpisodePlannerInput, EpisodePlannerSourceEvent } from './schema.js'

export interface EpisodePlannerContext {
  project: Project
  chapters: NovelChapter[]
  novelEvents: EpisodePlannerSourceEvent[]
  existingEpisodes: Episode[]
}

export async function buildEpisodePlannerContext(
  db: DatabaseClient,
  input: EpisodePlannerInput,
): Promise<EpisodePlannerContext> {
  const [project] = await db.select().from(projects).where(eq(projects.id, input.projectId)).limit(1)

  if (!project) {
    throw new Error(`Project not found: ${input.projectId}`)
  }

  const projectChapters = await db
    .select()
    .from(novelChapters)
    .where(eq(novelChapters.projectId, input.projectId))
    .orderBy(novelChapters.chapterNo)

  const chapterById = new Map(projectChapters.map((chapter) => [chapter.id, chapter]))
  const selectedChapterIds = new Set(input.chapterIds)
  const missingChapterId = input.chapterIds.find((chapterId) => !chapterById.has(chapterId))

  if (missingChapterId) {
    throw new Error(`Novel chapter not found for project: ${missingChapterId}`)
  }

  const selectedChapters = projectChapters.filter((chapter) => selectedChapterIds.has(chapter.id))

  if (selectedChapters.length === 0) {
    throw new Error('Episode planning requires at least one selected chapter')
  }

  const existingEvents = await db
    .select({ id: novelEvents.id })
    .from(novelEvents)
    .where(eq(novelEvents.projectId, input.projectId))

  const existingEventIds = new Set(existingEvents.map((event) => event.id))
  const seenInputEventIds = new Set<string>()

  for (const event of input.novelEvents) {
    if (seenInputEventIds.has(event.id)) {
      throw new Error(`Duplicate novel event in planner input: ${event.id}`)
    }

    seenInputEventIds.add(event.id)

    if (event.projectId !== input.projectId) {
      throw new Error(`Novel event belongs to a different project: ${event.id}`)
    }

    if (!selectedChapterIds.has(event.chapterId)) {
      throw new Error(`Novel event is outside selected chapters: ${event.id}`)
    }

    if (!existingEventIds.has(event.id)) {
      throw new Error(`Novel event not found: ${event.id}`)
    }
  }

  const existingEpisodes = await db
    .select()
    .from(episodes)
    .where(eq(episodes.projectId, input.projectId))
    .orderBy(episodes.episodeNo)

  return {
    project,
    chapters: selectedChapters,
    novelEvents: [...input.novelEvents].sort((a, b) => a.chapterNo - b.chapterNo || a.eventNo - b.eventNo),
    existingEpisodes,
  }
}
