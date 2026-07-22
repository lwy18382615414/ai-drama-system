import { computed, unref, type MaybeRefOrGetter } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import {
  createProject,
  deleteProject,
  fetchProject,
  fetchProjects,
  updateProject,
  type CreateProjectPayload,
  type UpdateProjectPayload,
} from '@/api/projects'
import { queryKeys } from '@/api/queryKeys'

const resolve = (v: MaybeRefOrGetter<string>) => (typeof v === 'function' ? v() : unref(v))

/**
 * Projects list + single-project detail + CRUD (frontend-design.md §3.1 ['projects']).
 * All are pure-edit mutations, so they invalidate their target keys directly.
 */
export function useProjectsQuery() {
  return useQuery({
    queryKey: queryKeys.projects(),
    queryFn: ({ signal }) => fetchProjects(signal),
  })
}

export function useProjectQuery(projectId: MaybeRefOrGetter<string>) {
  const id = computed(() => resolve(projectId))
  return useQuery({
    queryKey: computed(() => queryKeys.project(id.value)),
    queryFn: ({ signal }) => fetchProject(id.value, signal),
    enabled: computed(() => Boolean(id.value)),
  })
}

export function useCreateProjectMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateProjectPayload) => createProject(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.projects() }),
  })
}

export function useUpdateProjectMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { projectId: string; payload: UpdateProjectPayload }) =>
      updateProject(vars.projectId, vars.payload),
    onSuccess: (project) => {
      qc.setQueryData(queryKeys.project(project.id), project)
      qc.invalidateQueries({ queryKey: queryKeys.projects() })
    },
  })
}

export function useDeleteProjectMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (projectId: string) => deleteProject(projectId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.projects() }),
  })
}
