import { desc, eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { z } from 'zod/v4'
import type { DatabaseClient } from '../../../packages/database/index.js'
import { novelChapters, projects } from '../../../packages/database/index.js'
import { countWords, splitNovelText, type SplitChapter } from './novel-splitter.js'

export class ChapterImportServiceError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message)
  }
}

export const PreviewChaptersRequestSchema = z.object({
  text: z.string().min(1).max(2_000_000),
})

export const ImportChaptersRequestSchema = z.object({
  source: z.enum(['paste', 'txt', 'epub']).default('paste'),
  chapters: z
    .array(
      z.object({
        title: z.string().max(200).nullable(),
        content: z.string().min(1),
      }),
    )
    .min(1)
    .max(1000),
})

export type PreviewChaptersRequest = z.infer<typeof PreviewChaptersRequestSchema>
export type ImportChaptersRequest = z.infer<typeof ImportChaptersRequestSchema>

export function previewChapters(request: PreviewChaptersRequest): SplitChapter[] {
  return splitNovelText(request.text)
}

export async function importChapters(db: DatabaseClient, projectId: string, request: ImportChaptersRequest) {
  const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).limit(1)

  if (!project) {
    throw new ChapterImportServiceError(`Project not found: ${projectId}`, 404)
  }

  const [latest] = await db
    .select({ chapterNo: novelChapters.chapterNo })
    .from(novelChapters)
    .where(eq(novelChapters.projectId, projectId))
    .orderBy(desc(novelChapters.chapterNo))
    .limit(1)

  const startNo = (latest?.chapterNo ?? 0) + 1
  const now = new Date().toISOString()

  const rows = request.chapters.map((chapter, index) => ({
    id: nanoid(),
    projectId,
    chapterNo: startNo + index,
    title: chapter.title,
    content: chapter.content,
    wordCount: countWords(chapter.content),
    source: request.source,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  }))

  await db.transaction(async (tx) => {
    await tx.insert(novelChapters).values(rows)
  })

  return rows
}
