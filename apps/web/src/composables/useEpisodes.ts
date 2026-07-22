import { computed, unref, type MaybeRefOrGetter } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { fetchEpisodeEvents, fetchEpisodes } from '@/api/episodes'
import { queryKeys } from '@/api/queryKeys'

const resolve = (v: MaybeRefOrGetter<string>) => (typeof v === 'function' ? v() : unref(v))

/** Project episode list (with pipeline counts) + one episode's linked events. */
export function useEpisodesQuery(projectId: MaybeRefOrGetter<string>) {
  const id = computed(() => resolve(projectId))
  return useQuery({
    queryKey: computed(() => queryKeys.episodes(id.value)),
    queryFn: ({ signal }) => fetchEpisodes(id.value, signal),
    enabled: computed(() => Boolean(id.value)),
  })
}

export function useEpisodeEventsQuery(episodeId: MaybeRefOrGetter<string>) {
  const id = computed(() => resolve(episodeId))
  return useQuery({
    queryKey: computed(() => queryKeys.episodeEvents(id.value)),
    queryFn: ({ signal }) => fetchEpisodeEvents(id.value, signal),
    enabled: computed(() => Boolean(id.value)),
  })
}
