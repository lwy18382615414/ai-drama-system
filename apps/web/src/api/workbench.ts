import { get, http, post } from './client'

// ---- Row types, mirrored from packages/database/schema.ts + service serializers ----

export interface Chapter {
  id: string
  projectId: string
  chapterNo: number
  title: string | null
  content: string
  wordCount: number
  source: string | null
  status: string
}

export interface NovelEvent {
  id: string
  projectId: string
  chapterId: string
  eventNo: number
  eventType: string
  summary: string
  detail: string
  charactersJson: string
  location: string | null
  timeHint: string | null
  emotionTone: string | null
  conflictLevel: string
  importance: string
}

export interface Episode {
  id: string
  projectId: string
  episodeNo: number
  title: string | null
  summary: string | null
  openingHook: string | null
  endingHook: string | null
  scriptId: string | null
  status: string
}

export interface Script {
  id: string
  projectId: string
  episodeId: string
  title: string
  summary: string
  content: string
  status: string
}

/** One link row from getEpisodeEvents — the source event chain for an episode. */
export interface EpisodeEventLink {
  linkId: string
  orderInEpisode: number
  usageType: string
  event: NovelEvent
}

export interface Storyboard {
  id: string
  projectId: string
  episodeId: string
  shotNo: number
  duration: number
  sceneId: string | null
  scriptSectionNo: number | null
  shotType: string
  cameraAngle: string | null
  cameraMovement: string | null
  action: string
  narration: string | null
  emotion: string | null
  imagePrompt: string
  videoPrompt: string
  firstFrameImageUrl: string | null
  status: string
  characterIds: string[]
  propIds: string[]
  dialogue: unknown[]
}

export interface Character {
  id: string
  projectId: string
  name: string
  role: string | null
  age: string | null
  gender: string | null
  appearance: string | null
  personality: string | null
  background: string | null
  referenceImageUrl: string | null
  status: string
}

export interface Scene {
  id: string
  projectId: string
  name: string
  description: string | null
  locationType: string | null
  visualStyle: string | null
  visualPrompt: string | null
  referenceImageUrl: string | null
  status: string
}

export interface Prop {
  id: string
  projectId: string
  name: string
  description: string | null
  significance: string | null
  visualPrompt: string | null
  referenceImageUrl: string | null
  status: string
}

export interface TaskAck {
  taskId: string
  status: string
}

/** One planning batch — a contiguous chapter range planned into a contiguous episode range. */
export interface Batch {
  id: string
  projectId: string
  batchNo: number
  chapterStartNo: number
  chapterEndNo: number
  episodeStartNo: number
  episodeEndNo: number
  status: string
}

/** TaskAck plus the batch that was created/re-planned. */
export interface BatchTaskAck extends TaskAck {
  batchId: string
}

/** One chapter candidate returned by the novel split/preview endpoints. */
export interface ChapterPreview {
  title: string | null
  content: string
  wordCount: number
}

export interface EpubMeta {
  title: string | null
  author: string | null
}

// ---- Reads ----

export function getChapters(projectId: string) {
  return get<{ chapters: Chapter[] }>(`/api/projects/${projectId}/chapters`)
}

/** Events extracted for a single chapter (novel mode). */
export function getChapterEvents(chapterId: string) {
  return get<{ events: NovelEvent[] }>(`/api/agents/event/result/${chapterId}`)
}

export function getEpisodes(projectId: string) {
  return get<{ episodes: Episode[] }>(`/api/projects/${projectId}/episodes`)
}

export function getBatches(projectId: string) {
  return get<{ batches: Batch[] }>(`/api/projects/${projectId}/batches`)
}

/** Plan the next batch. Chapter start is server-locked; caller picks the end chapter. */
export function createBatch(projectId: string, chapterEndNo: number) {
  return post<BatchTaskAck>(`/api/projects/${projectId}/batches`, { chapterEndNo })
}

/** Scoped destructive re-plan of one batch. */
export function replanBatch(projectId: string, batchId: string) {
  return post<BatchTaskAck>(`/api/projects/${projectId}/batches/${batchId}/replan`)
}

/** Source event chain linked to an episode (script inspector). */
export function getEpisodeEvents(episodeId: string) {
  return get<{ episode: Episode; events: EpisodeEventLink[] }>(
    `/api/episodes/${episodeId}/events`,
  )
}

export function getEpisodeScript(episodeId: string) {
  // 404 is expected when the episode has no script yet — suppress the toast.
  return get<{ episode: Episode; script: Script }>(`/api/episodes/${episodeId}/script`, {
    skipErrorToast: true,
  })
}

export function getEpisodeStoryboards(episodeId: string) {
  return get<{ episode: Episode; storyboards: Storyboard[] }>(
    `/api/episodes/${episodeId}/storyboards`,
  )
}

export function getCharacters(projectId: string) {
  return get<{ characters: Character[] }>(`/api/projects/${projectId}/characters`)
}

export function getScenes(projectId: string) {
  return get<{ scenes: Scene[] }>(`/api/projects/${projectId}/scenes`)
}

export function getProps(projectId: string) {
  return get<{ props: Prop[] }>(`/api/projects/${projectId}/props`)
}

// ---- Novel import ----

/** Split pasted novel text into chapter candidates (no persistence). */
export function previewChapters(text: string) {
  return post<{ chapters: ChapterPreview[]; meta: EpubMeta | null }>('/api/novel/preview', { text })
}

/** Parse an uploaded .epub into chapter candidates (no persistence). */
export async function previewEpub(file: File) {
  const form = new FormData()
  form.append('file', file)
  const res = await http.post<{ data: { chapters: ChapterPreview[]; meta: EpubMeta | null } }>(
    '/api/novel/preview-file',
    form,
  )
  return res.data.data
}

/** Persist confirmed chapter candidates onto a project. */
export function importChapters(
  projectId: string,
  chapters: Array<{ title: string | null; content: string }>,
  source: 'paste' | 'txt' | 'epub' = 'paste',
) {
  return post<{ chapters: Chapter[] }>(`/api/projects/${projectId}/chapters/import`, {
    source,
    chapters,
  })
}

/** Enqueue AI event extraction for a single chapter. */
export function extractEvents(projectId: string, chapterId: string) {
  return post<TaskAck>('/api/agents/event/extract', { projectId, chapterId })
}

// ---- Generation actions (enqueue async tasks) ----

export function generateScript(episodeId: string) {
  return post<TaskAck>(`/api/episodes/${episodeId}/generate-script`)
}

export function generateStoryboards(episodeId: string) {
  return post<TaskAck>(`/api/episodes/${episodeId}/generate-storyboards`)
}

export function extractAssets(episodeId: string) {
  return post<TaskAck>(`/api/episodes/${episodeId}/extract-assets`)
}

export function generateCharacterImage(characterId: string) {
  return post<TaskAck>(`/api/characters/${characterId}/generate-image`)
}

export function generateSceneImage(sceneId: string) {
  return post<TaskAck>(`/api/scenes/${sceneId}/generate-image`)
}

export function generateStoryboardFirstFrame(storyboardId: string) {
  return post<TaskAck>(`/api/storyboards/${storyboardId}/generate-first-frame`)
}
