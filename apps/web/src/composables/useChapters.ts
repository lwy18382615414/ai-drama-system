import { computed, unref, type MaybeRefOrGetter } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import {
  deleteChapters,
  fetchProjectChapters,
  importChapters,
  type ImportChaptersPayload,
} from '@/api/chapters'
import { queryKeys } from '@/api/queryKeys'

const resolve = (v: MaybeRefOrGetter<string>) => (typeof v === 'function' ? v() : unref(v))

/** Chapters list + import/delete. Import/delete mutate chapters + project roll-ups. */
export function useChaptersQuery(projectId: MaybeRefOrGetter<string>) {
  const id = computed(() => resolve(projectId))
  return useQuery({
    queryKey: computed(() => queryKeys.chapters(id.value)),
    queryFn: ({ signal }) => fetchProjectChapters(id.value, signal),
    enabled: computed(() => Boolean(id.value)),
  })
}

export function useImportChaptersMutation(projectId: MaybeRefOrGetter<string>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: ImportChaptersPayload) => importChapters(resolve(projectId), payload),
    onSuccess: () => {
      const id = resolve(projectId)
      qc.invalidateQueries({ queryKey: queryKeys.chapters(id) })
      qc.invalidateQueries({ queryKey: queryKeys.project(id) })
    },
  })
}

export function useDeleteChaptersMutation(projectId: MaybeRefOrGetter<string>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (chapterIds: string[]) => deleteChapters(resolve(projectId), chapterIds),
    onSuccess: () => {
      const id = resolve(projectId)
      qc.invalidateQueries({ queryKey: queryKeys.chapters(id) })
      qc.invalidateQueries({ queryKey: queryKeys.project(id) })
    },
  })
}
