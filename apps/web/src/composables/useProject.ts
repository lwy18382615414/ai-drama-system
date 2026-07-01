import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { getProject } from '@/mock'

/** Resolves the project referenced by the current route's `:id` param (mock data). */
export function useProject() {
  const route = useRoute()
  const projectId = computed(() => route.params.id as string)
  const project = computed(() => getProject(projectId.value))
  return { projectId, project }
}
