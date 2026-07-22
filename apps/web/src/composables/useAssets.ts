import { computed, unref, type MaybeRefOrGetter } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import {
  extractAssets,
  fetchCharacter,
  fetchEpisodeAssets,
  fetchProjectCharacters,
  fetchProjectProps,
  fetchProjectScenes,
  fetchScene,
  type ExtractAssetsPayload,
} from '@/api/assets'
import { queryKeys } from '@/api/queryKeys'
import { invalidateActivity } from './useTaskInvalidation'
import type { EpisodeCtx } from './useScript'

const resolve = (v: MaybeRefOrGetter<string>) => (typeof v === 'function' ? v() : unref(v))

export function useEpisodeAssetsQuery(episodeId: MaybeRefOrGetter<string>) {
  const id = computed(() => resolve(episodeId))
  return useQuery({
    queryKey: computed(() => queryKeys.episodeAssets(id.value)),
    queryFn: ({ signal }) => fetchEpisodeAssets(id.value, signal),
    enabled: computed(() => Boolean(id.value)),
  })
}

export function useProjectCharactersQuery(projectId: MaybeRefOrGetter<string>) {
  const id = computed(() => resolve(projectId))
  return useQuery({
    queryKey: computed(() => queryKeys.characters(id.value)),
    queryFn: ({ signal }) => fetchProjectCharacters(id.value, signal),
    enabled: computed(() => Boolean(id.value)),
  })
}

export function useCharacterQuery(characterId: MaybeRefOrGetter<string>) {
  const id = computed(() => resolve(characterId))
  return useQuery({
    queryKey: computed(() => queryKeys.character(id.value)),
    queryFn: ({ signal }) => fetchCharacter(id.value, signal),
    enabled: computed(() => Boolean(id.value)),
  })
}

export function useProjectScenesQuery(projectId: MaybeRefOrGetter<string>) {
  const id = computed(() => resolve(projectId))
  return useQuery({
    queryKey: computed(() => queryKeys.scenes(id.value)),
    queryFn: ({ signal }) => fetchProjectScenes(id.value, signal),
    enabled: computed(() => Boolean(id.value)),
  })
}

export function useSceneQuery(sceneId: MaybeRefOrGetter<string>) {
  const id = computed(() => resolve(sceneId))
  return useQuery({
    queryKey: computed(() => queryKeys.scene(id.value)),
    queryFn: ({ signal }) => fetchScene(id.value, signal),
    enabled: computed(() => Boolean(id.value)),
  })
}

export function useProjectPropsQuery(projectId: MaybeRefOrGetter<string>) {
  const id = computed(() => resolve(projectId))
  return useQuery({
    queryKey: computed(() => queryKeys.props(id.value)),
    queryFn: ({ signal }) => fetchProjectProps(id.value, signal),
    enabled: computed(() => Boolean(id.value)),
  })
}

/** Task-class: extracted characters/scenes/props land via SSE; only flip activity here. */
export function useExtractAssetsMutation(ctx: EpisodeCtx) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { payload?: ExtractAssetsPayload; force?: boolean } = {}) =>
      extractAssets(resolve(ctx.episodeId), vars.payload ?? {}, vars.force ?? false),
    onSuccess: () => invalidateActivity(qc, resolve(ctx.projectId), resolve(ctx.episodeId)),
  })
}
