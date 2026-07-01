/**
 * Frontend view types for the Phase 1 skeleton. Field shapes mirror the backend
 * service/API contracts (apps/server/services/project-service.ts, docs/api-design.md)
 * so the mock data can later be swapped for real API responses with minimal churn.
 */

export type PipelineStatus = 'draft' | 'generating' | 'done' | 'failed'

export interface Project {
  id: string
  title: string
  description: string | null
  genre: string
  targetPlatform: string
  visualStyle: string
  episodeDuration: number
  status: PipelineStatus
  createdAt: string
  updatedAt: string
  episodeCount: number
  storyboardCount: number
  characterCount: number
  sceneCount: number
  imageCompletion: number
}

export interface Chapter {
  id: string
  projectId: string
  chapterNo: number
  title: string
  wordCount: number
  eventCount: number
  status: PipelineStatus
}

export interface NovelEvent {
  id: string
  chapterId: string
  order: number
  summary: string
  characters: string[]
  location: string
}

export interface Episode {
  id: string
  projectId: string
  episodeNo: number
  title: string
  synopsis: string
  status: PipelineStatus
  linkedEventCount: number
  hasScript: boolean
  storyboardCount: number
}

export interface Script {
  id: string
  episodeId: string
  version: number
  status: PipelineStatus
  content: string
}

export interface Character {
  id: string
  projectId: string
  name: string
  role: string
  appearance: string
  personality: string
  referenceImageUrl: string | null
}

export interface Scene {
  id: string
  projectId: string
  name: string
  description: string
  mood: string
}

export interface Prop {
  id: string
  projectId: string
  name: string
  description: string
}

export interface Storyboard {
  id: string
  episodeId: string
  shotNo: number
  description: string
  camera: string
  characters: string[]
  scene: string
  image_prompt: string
  video_prompt: string
  status: PipelineStatus
}

export interface GenerationTask {
  id: string
  targetType: string
  targetId: string
  taskType: string
  status: PipelineStatus
  createdAt: string
  resultUrl: string | null
}
