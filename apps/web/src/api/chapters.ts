import { get, post } from './request'
import type { NovelChapter } from './models'

/**
 * Chapters resource — mirrors the chapter routes in apps/server/routes/project.ts
 * + chapter-import-service.ts.
 */

/** GET /api/projects/:id/chapters → { chapters }. */
export function fetchProjectChapters(projectId: string, signal?: AbortSignal): Promise<NovelChapter[]> {
  return get<{ chapters: NovelChapter[] }>(`/projects/${projectId}/chapters`, { signal }).then(
    (d) => d.chapters,
  )
}

export interface ImportChaptersPayload {
  source?: 'paste' | 'txt' | 'epub'
  chapters: Array<{ title: string | null; content: string }>
}

/** POST /api/projects/:id/chapters/import → { chapters }. */
export function importChapters(projectId: string, payload: ImportChaptersPayload): Promise<NovelChapter[]> {
  return post<{ chapters: NovelChapter[] }>(`/projects/${projectId}/chapters/import`, payload).then(
    (d) => d.chapters,
  )
}

/** POST /api/projects/:id/chapters/delete → { deletedCount }. All-or-nothing. */
export function deleteChapters(projectId: string, chapterIds: string[]): Promise<{ deletedCount: number }> {
  return post(`/projects/${projectId}/chapters/delete`, { chapterIds })
}
