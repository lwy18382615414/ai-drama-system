import { QueryClient, VueQueryPlugin, type VueQueryPluginOptions } from '@tanstack/vue-query'

/**
 * Single QueryClient for the app. TanStack Query owns all server state
 * (frontend-design.md §3): caching, invalidation, refetch, polling fallback.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The board / task drawer degrade to 10s polling when SSE drops (§3.3);
      // that refetchInterval is set per-query by the composables, not globally.
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

export const vueQueryOptions: VueQueryPluginOptions = {
  queryClient,
}

export { VueQueryPlugin }
