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
