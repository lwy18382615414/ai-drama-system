import { onScopeDispose, ref, shallowRef, watch } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import { taskStreamUrl } from '@/api/sse'
import { queryKeys } from '@/api/queryKeys'
import type { TaskEvent } from '@/api/models'

/**
 * One EventSource per project: snapshot alignment on (re)connect, event → query
 * invalidate mapping (frontend-design.md §3.2), and disconnect degradation (§3.3).
 *
 * The frontend never derives status from these events — they only trigger refetches
 * (§2.2). Task-settlement invalidations here are the other half of the mutation
 * contract: `start*` mutations flip jobs+pipeline optimistically, and the real
 * target-resource refresh lands when the task settles over this stream.
 *
 * Invalidations are (a) fired only on real status transitions and (b) coalesced over a
 * short window, so a task's run→settle burst collapses into one refetch instead of
 * repeatedly invalidating an already-in-flight query (which vue-query would cancel).
 */

/** Poll interval used by degraded queries while the SSE connection is down. */
export const SSE_FALLBACK_POLL_MS = 10_000

/** Debounce window for coalescing a burst of task events into one refetch per key. */
const INVALIDATE_DEBOUNCE_MS = 150

/** Maps a settled/started task to the query keys its result touches. */
function invalidateForTask(
  invalidate: (key: readonly unknown[]) => void,
  projectId: string,
  task: TaskEvent,
) {
  // Activity views always move.
  invalidate(queryKeys.jobs(projectId))
  invalidate(queryKeys.episodePipeline(projectId))
  if (task.episodeId) {
    invalidate(queryKeys.episodePipelineStatus(task.episodeId))
  }

  switch (task.taskType) {
    case 'event_extraction':
      invalidate(queryKeys.chapters(projectId))
      // event_extraction tasks carry no targetId (the chapter id lives in inputJson), so we
      // can't target one chapter — refresh the whole chapter-events family so an already-open
      // events panel reflects the newly extracted events.
      invalidate(['chapter-events'])
      break
    case 'episode_planning':
      invalidate(queryKeys.episodes(projectId))
      invalidate(queryKeys.batches(projectId))
      break
    case 'project_profile':
      invalidate(queryKeys.project(projectId))
      invalidate(queryKeys.projects())
      break
    case 'script_generation':
      if (task.episodeId) invalidate(queryKeys.script(task.episodeId))
      break
    case 'asset_extraction':
      if (task.episodeId) invalidate(queryKeys.episodeAssets(task.episodeId))
      invalidate(queryKeys.characters(projectId))
      invalidate(queryKeys.scenes(projectId))
      invalidate(queryKeys.props(projectId))
      break
    case 'storyboard_generation':
      if (task.episodeId) invalidate(queryKeys.storyboards(task.episodeId))
      break
    case 'image_generation':
      if (task.episodeId) {
        invalidate(queryKeys.storyboards(task.episodeId))
        invalidate(queryKeys.imageStatus(task.episodeId))
      }
      invalidate(queryKeys.projectAssets(projectId))
      if (task.targetType === 'scene_reference_image') {
        invalidate(queryKeys.scenes(projectId))
        if (task.targetId) invalidate(queryKeys.scene(task.targetId))
      } else {
        // character reference / appearance version / storyboard frame all touch characters.
        invalidate(queryKeys.characters(projectId))
        if (task.targetType === 'character_reference_image' && task.targetId) {
          invalidate(queryKeys.character(task.targetId))
        }
        if (task.targetType === 'character_appearance_version') {
          // targetId is the version id, not the character — invalidate the whole
          // appearance-versions family so whichever character detail is open refreshes.
          invalidate(['appearance-versions'])
        }
      }
      break
  }
}

export function useProjectTaskStream(projectId: () => string) {
  const qc = useQueryClient()
  /** Live view of the project's active + recently-settled tasks (keyed by taskId). */
  const tasks = shallowRef<TaskEvent[]>([])
  /** False while the SSE connection is down — queries can degrade to polling (§3.3). */
  const connected = ref(false)

  let source: EventSource | null = null
  const byId = new Map<string, TaskEvent>()
  // The first snapshot only seeds local state — the page's queries are already loading
  // fresh, so invalidating them here would just cancel those in-flight requests.
  let primed = false

  // Coalesce invalidations: collect keys and flush once per window so a burst of task
  // events becomes a single refetch per key rather than a cancel-and-refetch storm.
  const pending = new Map<string, readonly unknown[]>()
  let flushTimer: ReturnType<typeof setTimeout> | null = null
  const flush = () => {
    flushTimer = null
    const keys = [...pending.values()]
    pending.clear()
    for (const key of keys) qc.invalidateQueries({ queryKey: key })
  }
  const scheduleInvalidate = (key: readonly unknown[]) => {
    pending.set(JSON.stringify(key), key)
    if (!flushTimer) flushTimer = setTimeout(flush, INVALIDATE_DEBOUNCE_MS)
  }
  const cancelFlush = () => {
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
    pending.clear()
  }

  const emit = () => {
    tasks.value = [...byId.values()]
  }

  const open = (id: string) => {
    if (!id) return
    close()
    const es = new EventSource(taskStreamUrl(id))
    source = es

    es.addEventListener('snapshot', (event) => {
      connected.value = true
      const payload = JSON.parse((event as MessageEvent).data) as { tasks: TaskEvent[] }

      // On a reconnect (already primed), diff against what we last knew and only invalidate
      // for tasks that changed while we were disconnected. The initial snapshot skips this.
      if (primed) {
        for (const task of payload.tasks) {
          const before = byId.get(task.taskId)
          if (!before || before.status !== task.status) {
            invalidateForTask(scheduleInvalidate, id, task)
          }
        }
        scheduleInvalidate(queryKeys.jobs(id))
      }

      byId.clear()
      for (const task of payload.tasks) byId.set(task.taskId, task)
      emit()
      primed = true
    })

    es.addEventListener('task', (event) => {
      const task = JSON.parse((event as MessageEvent).data) as TaskEvent
      const before = byId.get(task.taskId)
      byId.set(task.taskId, task)
      emit()
      // Only refetch when the task actually transitioned — duplicate same-status pushes
      // (and heartbeats) must not re-trigger a fetch.
      if (!before || before.status !== task.status) {
        invalidateForTask(scheduleInvalidate, id, task)
      }
    })

    // EventSource auto-reconnects; mark degraded so dependent queries can poll until
    // the next snapshot flips connected back to true.
    es.onerror = () => {
      connected.value = false
    }
  }

  const close = () => {
    source?.close()
    source = null
    connected.value = false
    cancelFlush()
    byId.clear()
    primed = false
  }

  watch(projectId, (id) => open(id), { immediate: true })
  onScopeDispose(close)

  return { tasks, connected }
}
