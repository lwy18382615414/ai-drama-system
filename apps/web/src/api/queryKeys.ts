/**
 * Query key factory — mirrors frontend-design.md §3.1 one-to-one with backend resources.
 * Invalidation granularity is defined by these keys.
 */
export const queryKeys = {
  projects: () => ['projects'] as const,
  project: (projectId: string) => ['project', projectId] as const,
  chapters: (projectId: string) => ['chapters', projectId] as const,
  batches: (projectId: string) => ['batches', projectId] as const,
  /** Project-level board aggregate (no backend endpoint yet — reserved). */
  episodePipeline: (projectId: string) => ['episode-pipeline', projectId] as const,
  /** Episode-level derived pipeline status (GET episodes/:id/pipeline-status). */
  episodePipelineStatus: (episodeId: string) => ['episode-pipeline-status', episodeId] as const,
  episodes: (projectId: string) => ['episodes', projectId] as const,
  episodeEvents: (episodeId: string) => ['episode-events', episodeId] as const,
  script: (episodeId: string) => ['script', episodeId] as const,
  episodeAssets: (episodeId: string) => ['episode-assets', episodeId] as const,
  imageStatus: (episodeId: string) => ['image-status', episodeId] as const,
  storyboards: (episodeId: string) => ['storyboards', episodeId] as const,
  storyboard: (storyboardId: string) => ['storyboard', storyboardId] as const,
  characters: (projectId: string) => ['characters', projectId] as const,
  character: (characterId: string) => ['character', characterId] as const,
  scenes: (projectId: string) => ['scenes', projectId] as const,
  scene: (sceneId: string) => ['scene', sceneId] as const,
  props: (projectId: string) => ['props', projectId] as const,
  projectAssets: (projectId: string) => ['project-assets', projectId] as const,
  appearanceVersions: (characterId: string) => ['appearance-versions', characterId] as const,
  chapterEvents: (chapterId: string) => ['chapter-events', chapterId] as const,
  jobs: (projectId: string) => ['jobs', projectId] as const,
  job: (jobId: string) => ['job', jobId] as const,
  generationTask: (taskId: string) => ['generation-task', taskId] as const,
  usage: (projectId: string) => ['usage', projectId] as const,
} as const
