import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * UI-only state (frontend-design.md §2/§3): selection sets, drawer open/close,
 * wizard step. Server state lives in TanStack Query, never here.
 */
export const useUiStore = defineStore('ui', () => {
  /** Selected episode ids on the pipeline board (batch operations). */
  const selectedEpisodeIds = ref<Set<string>>(new Set())
  /** Global task-center drawer open state. */
  const taskDrawerOpen = ref(false)
  /** Replan wizard step (0 = closed). */
  const replanWizardStep = ref(0)

  function toggleEpisode(id: string) {
    const next = new Set(selectedEpisodeIds.value)
    next.has(id) ? next.delete(id) : next.add(id)
    selectedEpisodeIds.value = next
  }

  function clearSelection() {
    selectedEpisodeIds.value = new Set()
  }

  return {
    selectedEpisodeIds,
    taskDrawerOpen,
    replanWizardStep,
    toggleEpisode,
    clearSelection,
  }
})
