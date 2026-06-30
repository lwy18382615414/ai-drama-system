import { and, desc, eq, lt } from 'drizzle-orm'
import type { DatabaseClient, NovelChapter, NovelEvent, Project } from '../../database/index.js'
import { novelChapters, novelEvents, projects } from '../../database/index.js'
import type { EventAgentInput } from './schema.js'

export interface EventAgentContext {
  project: Project
  chapter: NovelChapter
  previousEvents: NovelEvent[]
}

export async function buildEventAgentContext(
  db: DatabaseClient,
  input: EventAgentInput,
): Promise<EventAgentContext> {
  const [project] = await db.select().from(projects).where(eq(projects.id, input.projectId)).limit(1)

  if (!project) {
    throw new Error(`Project not found: ${input.projectId}`)
  }

  const [chapter] = await db
    .select()
    .from(novelChapters)
    .where(and(eq(novelChapters.id, input.chapterId), eq(novelChapters.projectId, input.projectId)))
    .limit(1)

  if (!chapter) {
    throw new Error(`Novel chapter not found for project: ${input.chapterId}`)
  }

  const previousChapters = await db
    .select({ id: novelChapters.id })
    .from(novelChapters)
    .where(
      and(
        eq(novelChapters.projectId, input.projectId),
        lt(novelChapters.chapterNo, chapter.chapterNo),
      ),
    )
    .orderBy(desc(novelChapters.chapterNo))
    .limit(3)

  const previousEvents: NovelEvent[] = []

  for (const previousChapter of previousChapters) {
    const events = await db
      .select()
      .from(novelEvents)
      .where(eq(novelEvents.chapterId, previousChapter.id))
      .orderBy(novelEvents.eventNo)
      .limit(10)

    previousEvents.push(...events)
  }

  return {
    project,
    chapter,
    previousEvents,
  }
}
