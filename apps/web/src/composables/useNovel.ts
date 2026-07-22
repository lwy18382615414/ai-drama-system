import { useMutation, useQueryClient } from '@tanstack/vue-query'
import {
  createProjectFromNovel,
  previewChapters,
  previewChaptersFile,
  type CreateProjectFromNovelPayload,
} from '@/api/novel'
import { queryKeys } from '@/api/queryKeys'

/**
 * Novel preview + novel-driven project creation (the create-project wizard).
 * Preview endpoints persist nothing, so they are plain mutations with no invalidation.
 */
export function usePreviewChaptersMutation() {
  return useMutation({ mutationFn: (text: string) => previewChapters(text) })
}

export function usePreviewChaptersFileMutation() {
  return useMutation({ mutationFn: (file: File) => previewChaptersFile(file) })
}

export function useCreateProjectFromNovelMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateProjectFromNovelPayload) => createProjectFromNovel(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.projects() }),
  })
}
