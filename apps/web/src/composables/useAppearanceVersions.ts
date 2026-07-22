import { computed, unref, type MaybeRefOrGetter } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import {
  createAppearanceVersion,
  deleteAppearanceVersion,
  fetchAppearanceVersions,
  generateAppearanceVersionImage,
  updateAppearanceVersion,
  type CreateAppearanceVersionPayload,
  type UpdateAppearanceVersionPayload,
} from '@/api/appearanceVersions'
import { queryKeys } from '@/api/queryKeys'
import { invalidateActivity } from './useTaskInvalidation'

const resolve = (v: MaybeRefOrGetter<string>) => (typeof v === 'function' ? v() : unref(v))

export function useAppearanceVersionsQuery(characterId: MaybeRefOrGetter<string>) {
  const id = computed(() => resolve(characterId))
  return useQuery({
    queryKey: computed(() => queryKeys.appearanceVersions(id.value)),
    queryFn: ({ signal }) => fetchAppearanceVersions(id.value, signal),
    enabled: computed(() => Boolean(id.value)),
  })
}

/** Edit-class: create / update / delete refresh the character's version list. */
export function useCreateAppearanceVersionMutation(characterId: MaybeRefOrGetter<string>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateAppearanceVersionPayload) =>
      createAppearanceVersion(resolve(characterId), payload),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.appearanceVersions(resolve(characterId)) }),
  })
}

export function useUpdateAppearanceVersionMutation(characterId: MaybeRefOrGetter<string>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { versionId: string; payload: UpdateAppearanceVersionPayload }) =>
      updateAppearanceVersion(vars.versionId, vars.payload),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.appearanceVersions(resolve(characterId)) }),
  })
}

export function useDeleteAppearanceVersionMutation(characterId: MaybeRefOrGetter<string>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (versionId: string) => deleteAppearanceVersion(versionId),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.appearanceVersions(resolve(characterId)) }),
  })
}

/** Task-class: the generated version image lands via SSE; only flip activity here. */
export function useGenerateAppearanceVersionImageMutation(projectId: MaybeRefOrGetter<string>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { versionId: string; options?: Record<string, unknown>; force?: boolean }) =>
      generateAppearanceVersionImage(vars.versionId, { options: vars.options }, vars.force ?? false),
    onSuccess: () => invalidateActivity(qc, resolve(projectId)),
  })
}
