import { computed, unref, type MaybeRefOrGetter } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { fetchEpisodePipelineStatus } from '@/api/pipeline'
import { queryKeys } from '@/api/queryKeys'

/**
 * Episode-level derived pipeline status (frontend-design.md §2.1: the frontend never
 * derives status itself — it reads the backend's computeEpisodePipelineStatus()).
 * Button-gating helpers on top of this are UI concerns and are added at the page layer.
 *
 * Note: the project-level board aggregate (§5.1 "一次请求整页") has no backend endpoint
 * yet, so this is scoped to a single episode.
 */
export function usePipelineStatus(episodeId: MaybeRefOrGetter<string>) {
  const id = computed(() => (typeof episodeId === 'function' ? episodeId() : unref(episodeId)))
  return useQuery({
    queryKey: computed(() => queryKeys.episodePipelineStatus(id.value)),
    queryFn: ({ signal }) => fetchEpisodePipelineStatus(id.value, signal),
    enabled: computed(() => Boolean(id.value)),
  })
}
