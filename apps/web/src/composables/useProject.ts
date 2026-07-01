import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { getProject, type ProjectDetail } from '@/api/projects'
import { getApiErrorMessage } from '@/api/client'

export function useProject() {
  const route = useRoute()
  const projectId = computed(() => route.params.id as string)
  const project = ref<ProjectDetail | null>(null)
  const loading = ref(false)
  const message = useMessage()

  async function load() {
    if (!projectId.value) {
      project.value = null
      return
    }

    loading.value = true
    try {
      project.value = await getProject(projectId.value)
    } catch (error) {
      project.value = null
      message.error(getApiErrorMessage(error))
    } finally {
      loading.value = false
    }
  }

  onMounted(load)
  watch(projectId, load)

  return { projectId, project, loading, reload: load }
}
