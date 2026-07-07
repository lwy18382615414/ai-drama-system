import {
  computed,
  onScopeDispose,
  ref,
  shallowRef,
  watch,
  type ComputedRef,
  type Ref,
  type ShallowRef,
} from 'vue'

const baseURL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'

/** Wire shape from apps/server — packages/tasks/task-event.ts (TaskEvent). */
export interface TaskEvent {
  taskId: string
  projectId: string
  taskType: string
  targetType: string | null
  targetId: string | null
  episodeId: string | null
  storyboardId: string | null
  status: string
  retryCount: number
  errorMessage: string | null
  updatedAt: string
}

export interface TaskStream {
  tasks: ShallowRef<TaskEvent[]>
  activeCount: ComputedRef<number>
  connected: Ref<boolean>
}

const ACTIVE = new Set(['pending', 'running'])

/**
 * One SSE connection per projectId, shared across every caller. Instead of the
 * shell opening the stream and pushing it down through provide/inject, each
 * component calls this hook directly and a reference-counted registry keeps a
 * single EventSource alive while at least one consumer is mounted.
 */
interface StreamEntry {
  refCount: number
  source: EventSource | null
  byId: Map<string, TaskEvent>
  tasks: ShallowRef<TaskEvent[]>
  connected: Ref<boolean>
  activeCount: ComputedRef<number>
}

const registry = new Map<string, StreamEntry>()

function createEntry(projectId: string): StreamEntry {
  const byId = new Map<string, TaskEvent>()
  const tasks = shallowRef<TaskEvent[]>([])
  const connected = ref(false)

  function publish() {
    tasks.value = [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  const source = new EventSource(`${baseURL}/api/projects/${projectId}/tasks/stream`)
  source.addEventListener('open', () => (connected.value = true))
  source.addEventListener('snapshot', (e) => {
    const { tasks: snapshot } = JSON.parse((e as MessageEvent).data) as { tasks: TaskEvent[] }
    byId.clear()
    for (const t of snapshot) byId.set(t.taskId, t)
    publish()
  })
  source.addEventListener('task', (e) => {
    const event = JSON.parse((e as MessageEvent).data) as TaskEvent
    byId.set(event.taskId, event)
    publish()
  })
  source.addEventListener('error', () => (connected.value = false))

  return {
    refCount: 0,
    source,
    byId,
    tasks,
    connected,
    activeCount: computed(() => tasks.value.filter((t) => ACTIVE.has(t.status)).length),
  }
}

function acquire(projectId: string): StreamEntry {
  let entry = registry.get(projectId)
  if (!entry) {
    entry = createEntry(projectId)
    registry.set(projectId, entry)
  }
  entry.refCount += 1
  return entry
}

function release(projectId: string) {
  const entry = registry.get(projectId)
  if (!entry) return
  entry.refCount -= 1
  if (entry.refCount <= 0) {
    entry.source?.close()
    registry.delete(projectId)
  }
}

/**
 * Subscribes to a project's task lifecycle SSE stream
 * (`GET /api/projects/:id/tasks/stream`). On connect the server sends a
 * `snapshot` event (active + recently-settled tasks), then `task` events as
 * status changes — so this recovers automatically across reconnects.
 *
 * Returns a live, de-duplicated task list plus an active-count for the header.
 * Multiple callers for the same project share one connection.
 */
export function useTaskStream(projectId: Ref<string>): TaskStream {
  const tasks = shallowRef<TaskEvent[]>([])
  const connected = ref(false)
  const activeCount = computed(() => tasks.value.filter((t) => ACTIVE.has(t.status)).length)

  let current: string | null = null

  function detach() {
    if (current) {
      release(current)
      current = null
    }
  }

  watch(
    projectId,
    (id) => {
      detach()
      if (!id) {
        tasks.value = []
        connected.value = false
        return
      }
      const entry = acquire(id)
      current = id
      // Re-expose the shared entry's reactive state through this caller's refs.
      watch(entry.tasks, (v) => (tasks.value = v), { immediate: true })
      watch(entry.connected, (v) => (connected.value = v), { immediate: true })
    },
    { immediate: true },
  )

  onScopeDispose(detach)

  return { tasks, connected, activeCount }
}
