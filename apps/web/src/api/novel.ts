import { post } from './request'
import { http } from './http'
import type { NovelChapter, Project } from './models'

/**
 * Project-agnostic novel preview + novel-driven project creation.
 * Mirrors apps/server/routes/novel.ts and project-service.createProjectFromNovel.
 */

/** Splitter output (server SplitChapter). */
export interface SplitChapter {
  title: string | null
  content: string
  wordCount: number
}

export interface EpubMeta {
  title: string | null
  author: string | null
}

/** POST /api/novel/preview → { chapters, meta: null }. Splitting is automatic; only `text` is sent. */
export function previewChapters(text: string, signal?: AbortSignal): Promise<SplitChapter[]> {
  return post<{ chapters: SplitChapter[]; meta: null }>('/novel/preview', { text }, { signal }).then(
    (d) => d.chapters,
  )
}

/** POST /api/novel/preview-file (multipart) → { chapters, meta }. */
export function previewChaptersFile(
  file: File,
  signal?: AbortSignal,
): Promise<{ chapters: SplitChapter[]; meta: EpubMeta }> {
  const form = new FormData()
  form.append('file', file)
  // postForm lets axios set multipart/form-data with the correct boundary (our instance
  // otherwise defaults Content-Type to application/json). The interceptor unwraps the envelope.
  return http.postForm<unknown, { chapters: SplitChapter[]; meta: EpubMeta }>(
    '/novel/preview-file',
    form,
    { signal },
  )
}

export interface CreateProjectFromNovelPayload {
  title?: string
  source: 'paste' | 'txt' | 'epub'
  chapters: Array<{ title: string | null; content: string }>
  novelMeta?: { title?: string | null; author?: string | null }
}

/** POST /api/projects/from-novel → { project, chapters, taskId, taskStatus }. */
export function createProjectFromNovel(payload: CreateProjectFromNovelPayload): Promise<{
  project: Project
  chapters: NovelChapter[]
  taskId: string
  taskStatus: 'pending'
}> {
  return post('/projects/from-novel', payload)
}
