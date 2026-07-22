import { get, post, patch, del } from './request'
import type { Project } from './models'

/**
 * Projects resource — mirrors apps/server/routes/project.ts + project-service.ts.
 */

/** Per-project summary returned by GET /api/projects (server ProjectSummary). */
export interface ProjectSummary extends Project {
  chapterCount: number
  episodeCount: number
  scriptCount: number
  storyboardCount: number
  storyboardEpisodeCount: number
  characterCount: number
  sceneCount: number
  /** 0–100 aggregate image-completion percentage. */
  imageCompletion: number
}

/** GET /api/projects/:id (server ProjectDetail) — summary plus extra roll-ups. */
export interface ProjectDetail extends ProjectSummary {
  eventCount: number
  propCount: number
  completedImages: number
  batchCount: number
  extractedChapterCount: number
  plannedChapterEndNo: number
  assetsExtractedEpisodeCount: number
}

export interface CreateProjectPayload {
  title: string
  description?: string
  genre?: string
  targetPlatform?: string
  visualStyle?: string
  episodeDuration?: number
}

export type UpdateProjectPayload = Partial<{
  title: string
  description: string | null
  genre: string
  targetPlatform: string
  visualStyle: string
  episodeDuration: number
}>

/** GET /api/projects → { projects }. */
export function fetchProjects(signal?: AbortSignal): Promise<ProjectSummary[]> {
  return get<{ projects: ProjectSummary[] }>('/projects', { signal }).then((d) => d.projects)
}

/** GET /api/projects/:id → { project }. */
export function fetchProject(projectId: string, signal?: AbortSignal): Promise<ProjectDetail> {
  return get<{ project: ProjectDetail }>(`/projects/${projectId}`, { signal }).then((d) => d.project)
}

/** POST /api/projects → { project }. */
export function createProject(payload: CreateProjectPayload): Promise<Project> {
  return post<{ project: Project }>('/projects', payload).then((d) => d.project)
}

/** PATCH /api/projects/:id → { project }. */
export function updateProject(projectId: string, payload: UpdateProjectPayload): Promise<ProjectDetail> {
  return patch<{ project: ProjectDetail }>(`/projects/${projectId}`, payload).then((d) => d.project)
}

/** DELETE /api/projects/:id. */
export function deleteProject(projectId: string): Promise<null> {
  return del<null>(`/projects/${projectId}`)
}
