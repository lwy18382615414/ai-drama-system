import { apiClient } from "@/api/client";

export interface Episode {
  id: string;
  projectId: string;
  episodeNo: number;
  title: string | null;
  summary: string | null;
  openingHook: string | null;
  endingHook: string | null;
  scriptId: string | null;
  videoUrl: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface NovelEvent {
  id: string;
  projectId: string;
  chapterId: string;
  eventNo: number;
  eventType: string;
  summary: string;
  detail: string;
  characters: string[];
  location: string | null;
  timeHint: string | null;
  emotionTone: string | null;
  conflictLevel: string;
  importance: string;
  createdAt: string;
  updatedAt: string;
}

export interface EpisodeEventLink {
  linkId: string;
  projectId: string;
  episodeId: string;
  novelEventId: string;
  orderInEpisode: number;
  usageType: string;
  event: NovelEvent;
}

interface RawNovelEventRow {
  id: string;
  projectId: string;
  chapterId: string;
  eventNo: number;
  eventType: string;
  summary: string;
  detail: string;
  charactersJson: string;
  location: string | null;
  timeHint: string | null;
  emotionTone: string | null;
  conflictLevel: string;
  importance: string;
  createdAt: string;
  updatedAt: string;
}

function parseCharactersJson(charactersJson: string): string[] {
  try {
    const parsed = JSON.parse(charactersJson);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function toNovelEvent(row: RawNovelEventRow): NovelEvent {
  const { charactersJson, ...rest } = row;
  return { ...rest, characters: parseCharactersJson(charactersJson) };
}

export async function planEpisodes(
  projectId: string,
  chapterIds?: string[],
): Promise<{ taskId: string; status: string }> {
  const { data } = await apiClient.post<{ taskId: string; status: string }>(
    `/projects/${projectId}/plan-episodes`,
    { chapterIds },
  );
  return data;
}

export async function listEpisodes(projectId: string): Promise<Episode[]> {
  const { data } = await apiClient.get<{ episodes: Episode[] }>(
    `/projects/${projectId}/episodes`,
  );
  return data.episodes;
}

export async function getEpisodeEvents(
  episodeId: string,
): Promise<{ episode: Episode; events: EpisodeEventLink[] }> {
  const { data } = await apiClient.get<{
    episode: Episode;
    events: Array<
      Omit<EpisodeEventLink, "event"> & { event: RawNovelEventRow }
    >;
  }>(`/episodes/${episodeId}/events`);

  return {
    episode: data.episode,
    events: data.events.map((link) => ({
      ...link,
      event: toNovelEvent(link.event),
    })),
  };
}
