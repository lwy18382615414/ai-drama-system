import { apiClient } from '@/api/client'

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

export interface ProjectDetail extends ProjectSummary {
  chapterCount: number
  eventCount: number
  propCount: number
  scriptCount: number
  completedImages: number
}

export interface NovelChapter {
  id: string
  projectId: string
  chapterNo: number
  title: string | null
  content: string
  wordCount: number
  source: string | null
  status: string
  createdAt: string
  updatedAt: string
}

export interface CreateProjectInput {
  title: string
  description?: string
  genre?: string
  targetPlatform?: string
  visualStyle?: string
  episodeDuration?: number
}

export interface UpdateProjectInput {
  title?: string
  description?: string | null
  genre?: string
  targetPlatform?: string
  visualStyle?: string
  episodeDuration?: number
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const { data } = await apiClient.get<{ projects: ProjectSummary[] }>('/projects')
  return data.projects
}

export async function getProject(projectId: string): Promise<ProjectDetail> {
  const { data } = await apiClient.get<{ project: ProjectDetail }>(`/projects/${projectId}`)
  return data.project
}

export async function getProjectChapters(projectId: string): Promise<NovelChapter[]> {
  const { data } = await apiClient.get<{ chapters: NovelChapter[] }>(`/projects/${projectId}/chapters`)
  return data.chapters
}

export async function createProject(input: CreateProjectInput): Promise<ProjectSummary> {
  const { data } = await apiClient.post<{ project: ProjectSummary }>('/projects', input)
  return data.project
}

export async function updateProject(projectId: string, input: UpdateProjectInput): Promise<ProjectDetail> {
  const { data } = await apiClient.patch<{ project: ProjectDetail }>(`/projects/${projectId}`, input)
  return data.project
}

export interface SplitChapterPreview {
  title: string | null
  content: string
  wordCount: number
}

export type NovelSource = 'paste' | 'txt' | 'epub'

export interface NovelMeta {
  title: string | null
  author: string | null
}

export interface NovelPreviewResult {
  chapters: SplitChapterPreview[]
  meta: NovelMeta | null
}

export interface ImportChaptersInput {
  source: NovelSource
  chapters: { title: string | null; content: string }[]
}

export interface CreateProjectFromNovelInput {
  title?: string
  source: NovelSource
  chapters: { title: string | null; content: string }[]
  novelMeta?: NovelMeta
}

export interface CreateProjectFromNovelResult {
  project: ProjectSummary
  chapters: NovelChapter[]
  taskId: string
  taskStatus: string
}

export async function previewNovelText(text: string): Promise<NovelPreviewResult> {
  const { data } = await apiClient.post<NovelPreviewResult>('/novel/preview', { text })
  return data
}

export async function previewNovelFile(file: File): Promise<NovelPreviewResult> {
  const form = new FormData()
  form.append('file', file)
  const { data } = await apiClient.post<NovelPreviewResult>('/novel/preview-file', form)
  return data
}

export async function createProjectFromNovel(
  input: CreateProjectFromNovelInput,
): Promise<CreateProjectFromNovelResult> {
  const { data } = await apiClient.post<CreateProjectFromNovelResult>('/projects/from-novel', input)
  return data
}

export async function deleteProject(projectId: string): Promise<void> {
  await apiClient.delete(`/projects/${projectId}`)
}

export async function importChapters(projectId: string, input: ImportChaptersInput): Promise<NovelChapter[]> {
  const { data } = await apiClient.post<{ chapters: NovelChapter[] }>(
    `/projects/${projectId}/chapters/import`,
    input,
  )
  return data.chapters
}
