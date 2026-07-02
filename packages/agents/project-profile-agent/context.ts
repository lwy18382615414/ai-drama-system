import { eq } from 'drizzle-orm'
import type { DatabaseClient, Project } from '../../database/index.js'
import { novelChapters, projects } from '../../database/index.js'
import type { ProjectProfileAgentInput } from './schema.js'

/** Character budget for the opening-text sample fed to the model. */
export const SAMPLE_CHAR_BUDGET = 8000
/** At most this many chapter titles are listed in the prompt. */
export const MAX_TITLE_LIST = 50

export interface ProjectProfileAgentContext {
  project: Project
  chapterCount: number
  chapterTitles: string[]
  openingSample: string
}

export async function buildProjectProfileAgentContext(
  db: DatabaseClient,
  input: ProjectProfileAgentInput,
): Promise<ProjectProfileAgentContext> {
  const [project] = await db.select().from(projects).where(eq(projects.id, input.projectId)).limit(1)

  if (!project) {
    throw new Error(`Project not found: ${input.projectId}`)
  }

  const chapters = await db
    .select({
      chapterNo: novelChapters.chapterNo,
      title: novelChapters.title,
      content: novelChapters.content,
    })
    .from(novelChapters)
    .where(eq(novelChapters.projectId, input.projectId))
    .orderBy(novelChapters.chapterNo)

  if (chapters.length === 0) {
    throw new Error(`Project has no novel chapters to profile: ${input.projectId}`)
  }

  const chapterTitles = chapters
    .slice(0, MAX_TITLE_LIST)
    .map((chapter) => chapter.title ?? `第${chapter.chapterNo}章（无标题）`)

  let openingSample = ''
  for (const chapter of chapters) {
    if (openingSample.length >= SAMPLE_CHAR_BUDGET) break
    const remaining = SAMPLE_CHAR_BUDGET - openingSample.length
    openingSample += `${chapter.title ? `${chapter.title}\n` : ''}${chapter.content.slice(0, remaining)}\n\n`
  }

  return {
    project,
    chapterCount: chapters.length,
    chapterTitles,
    openingSample: openingSample.trim(),
  }
}
