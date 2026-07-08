import { and, asc, desc, eq, gt, inArray } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { z } from 'zod/v4'
import type { DatabaseClient } from '../../../packages/database/index.js'
import { novelChapters, novelEvents, projects } from '../../../packages/database/index.js'
import { activeExtractionChapterIds, plannedChapterEndNo } from './chapter-guards.js'
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

export const DeleteChaptersRequestSchema = z.object({
  chapterIds: z.array(z.string().min(1)).min(1).max(1000),
})

export type PreviewChaptersRequest = z.infer<typeof PreviewChaptersRequestSchema>
export type ImportChaptersRequest = z.infer<typeof ImportChaptersRequestSchema>
export type DeleteChaptersRequest = z.infer<typeof DeleteChaptersRequestSchema>

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

/**
 * All-or-nothing batch chapter deletion. Only unplanned chapters (chapterNo above the last
 * batch's chapterEndNo) that are not currently extracting may be deleted — planned chapters'
 * events are FK-referenced by episode_event_links, and a gap inside a planned range would
 * break the planner's contiguity invariant. After deleting, the remaining unplanned tail is
 * renumbered to close gaps so future batch planning keeps a contiguous chapterNo sequence.
 */
export async function deleteChapters(db: DatabaseClient, projectId: string, request: DeleteChaptersRequest) {
  const input = DeleteChaptersRequestSchema.parse(request)
  const chapterIds = [...new Set(input.chapterIds)]

  const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).limit(1)

  if (!project) {
    throw new ChapterImportServiceError(`Project not found: ${projectId}`, 404)
  }

  const rows = await db
    .select({ id: novelChapters.id, chapterNo: novelChapters.chapterNo, status: novelChapters.status })
    .from(novelChapters)
    .where(and(eq(novelChapters.projectId, projectId), inArray(novelChapters.id, chapterIds)))

  const byId = new Map(rows.map((row) => [row.id, row]))
  const missing = chapterIds.filter((id) => !byId.has(id))

  if (missing.length > 0) {
    throw new ChapterImportServiceError(`Chapters not found in project: ${missing.join(', ')}`, 400)
  }

  const [plannedEndNo, extractingIds] = await Promise.all([
    plannedChapterEndNo(db, projectId),
    activeExtractionChapterIds(db, projectId),
  ])

  const violations: string[] = []
  for (const chapterId of chapterIds) {
    const chapter = byId.get(chapterId)!
    if (chapter.chapterNo <= plannedEndNo) {
      violations.push(`第${chapter.chapterNo}章(已规划入批次)`)
    } else if (chapter.status === 'event_extracting' || extractingIds.has(chapterId)) {
      violations.push(`第${chapter.chapterNo}章(正在提取事件)`)
    }
  }

  if (violations.length > 0) {
    throw new ChapterImportServiceError(`Cannot delete chapters: ${violations.join(', ')}`, 409)
  }

  const now = new Date().toISOString()

  await db.transaction(async (tx) => {
    await tx.delete(novelEvents).where(inArray(novelEvents.chapterId, chapterIds))
    await tx.delete(novelChapters).where(inArray(novelChapters.id, chapterIds))

    // Renumber the surviving unplanned tail to close the gaps left by the deletion. Every
    // renumbered chapter is unplanned, so no batch chapter range is ever affected.
    const remaining = await tx
      .select({ id: novelChapters.id, chapterNo: novelChapters.chapterNo })
      .from(novelChapters)
      .where(and(eq(novelChapters.projectId, projectId), gt(novelChapters.chapterNo, plannedEndNo)))
      .orderBy(asc(novelChapters.chapterNo))

    let expectedNo = plannedEndNo
    for (const chapter of remaining) {
      expectedNo += 1
      if (chapter.chapterNo !== expectedNo) {
        await tx
          .update(novelChapters)
          .set({ chapterNo: expectedNo, updatedAt: now })
          .where(eq(novelChapters.id, chapter.id))
      }
    }
  })

  return { deletedCount: chapterIds.length }
}
