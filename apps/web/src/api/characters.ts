import { apiClient } from "@/api/client";

export async function generateCharacterImage(
  characterId: string,
  opts?: { force?: boolean },
): Promise<{ taskId: string; status: string }> {
  const { data } = await apiClient.post<{ taskId: string; status: string }>(
    `/characters/${characterId}/generate-image`,
    { force: opts?.force },
  );
  return data;
}
