import { apiClient } from "@/api/client";

export interface Character {
  id: string;
  projectId: string;
  name: string;
  aliasJson: string[];
  role: string | null;
  age: string | null;
  gender: string | null;
  appearance: string | null;
  personality: string | null;
  background: string | null;
  relationshipJson: unknown[];
  referenceImageUrl: string | null;
  voiceId: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface Scene {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  locationType: string | null;
  visualStyle: string | null;
  visualPrompt: string | null;
  referenceImageUrl: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface Prop {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  significance: string | null;
  visualPrompt: string | null;
  referenceImageUrl: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export async function extractAssets(
  episodeId: string,
  opts?: { force?: boolean },
): Promise<{ taskId: string; status: string }> {
  const { data } = await apiClient.post<{ taskId: string; status: string }>(
    `/episodes/${episodeId}/extract-assets`,
    { force: opts?.force },
  );
  return data;
}

export async function listProjectCharacters(
  projectId: string,
): Promise<Character[]> {
  const { data } = await apiClient.get<{ characters: Character[] }>(
    `/projects/${projectId}/characters`,
  );
  return data.characters;
}

export async function getCharacter(characterId: string): Promise<Character> {
  const { data } = await apiClient.get<{ character: Character }>(
    `/characters/${characterId}`,
  );
  return data.character;
}

export async function listProjectScenes(projectId: string): Promise<Scene[]> {
  const { data } = await apiClient.get<{ scenes: Scene[] }>(
    `/projects/${projectId}/scenes`,
  );
  return data.scenes;
}

export async function listProjectProps(projectId: string): Promise<Prop[]> {
  const { data } = await apiClient.get<{ props: Prop[] }>(
    `/projects/${projectId}/props`,
  );
  return data.props;
}

export interface EpisodeAssets {
  episode: { id: string; projectId: string };
  characters: Character[];
  scenes: Scene[];
  props: Prop[];
}

/** Assets already linked to an episode — used to tell whether extraction has run yet. */
export async function getEpisodeAssets(episodeId: string): Promise<EpisodeAssets> {
  const { data } = await apiClient.get<{
    episode: { id: string; projectId: string };
    characters: Array<{ character: Character }>;
    scenes: Array<{ scene: Scene }>;
    props: Array<{ prop: Prop }>;
  }>(`/episodes/${episodeId}/assets`);
  return {
    episode: data.episode,
    characters: data.characters.map((row) => row.character),
    scenes: data.scenes.map((row) => row.scene),
    props: data.props.map((row) => row.prop),
  };
}

export async function generateSceneImage(
  sceneId: string,
  opts?: { force?: boolean },
): Promise<{ taskId: string; status: string }> {
  const { data } = await apiClient.post<{ taskId: string; status: string }>(
    `/scenes/${sceneId}/generate-image`,
    { force: opts?.force },
  );
  return data;
}
