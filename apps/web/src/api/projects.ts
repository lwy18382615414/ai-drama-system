import { del, get, http, patch, post } from './client'
import type { ApiResponse } from './types'

/** Mirrors ProjectSummary in apps/server/services/project-service.ts. */
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
  storyboardEpisodeCount: number
  characterCount: number
  sceneCount: number
  imageCompletion: number
}

/** Mirrors ProjectDetail in apps/server/services/project-service.ts. */
export interface ProjectDetail extends ProjectSummary {
  eventCount: number
  propCount: number
  completedImages: number
  batchCount: number
  extractedChapterCount: number
  plannedChapterEndNo: number
}

export interface CreateProjectRequest {
  title: string
  description?: string
  genre?: string
  targetPlatform?: string
  visualStyle?: string
  episodeDuration?: number
}

export type UpdateProjectRequest = Partial<
  Pick<
    ProjectSummary,
    'title' | 'description' | 'genre' | 'targetPlatform' | 'visualStyle' | 'episodeDuration'
  >
>

export function listProjects() {
  return get<{ projects: ProjectSummary[] }>('/api/projects')
}

export function getProject(projectId: string) {
  return get<{ project: ProjectDetail }>(`/api/projects/${projectId}`)
}

export function createProject(payload: CreateProjectRequest) {
  return post<{ project: ProjectSummary }>('/api/projects', payload)
}

export function updateProject(projectId: string, payload: UpdateProjectRequest) {
  return patch<{ project: ProjectSummary }>(`/api/projects/${projectId}`, payload)
}

export function deleteProject(projectId: string) {
  return del<null>(`/api/projects/${projectId}`)
}

// ---- Create-from-novel flow (paste / .txt / .epub) ----

/** Mirrors SplitChapter in apps/server/services/novel-splitter.ts. */
export interface SplitChapter {
  title: string | null
  content: string
  wordCount: number
}

/** Source-file metadata (EPUB title/author) passed to the profile agent as a hint. */
export interface NovelMeta {
  title: string | null
  author: string | null
}

export type NovelSource = 'paste' | 'txt' | 'epub'

export interface CreateFromNovelRequest {
  title?: string
  source: NovelSource
  chapters: { title: string | null; content: string }[]
  novelMeta?: NovelMeta
}

/** Split pasted/txt novel text into chapter candidates (no persistence). */
export function previewNovel(text: string) {
  return post<{ chapters: SplitChapter[]; meta: NovelMeta | null }>('/api/novel/preview', { text })
}

/** Parse and split an uploaded .epub into chapter candidates + metadata. */
export async function previewNovelFile(file: File) {
  const form = new FormData()
  form.append('file', file)
  // Let the browser set the multipart boundary — override the instance JSON default.
  const res = await http.post<ApiResponse<{ chapters: SplitChapter[]; meta: NovelMeta }>>(
    '/api/novel/preview-file',
    form,
    { headers: { 'Content-Type': null } },
  )
  return res.data.data
}

/** Create a draft project from split chapters; profile analysis runs in the background. */
export function createProjectFromNovel(payload: CreateFromNovelRequest) {
  return post<{ project: ProjectSummary; taskId: string; taskStatus: string }>(
    '/api/projects/from-novel',
    payload,
  )
}
