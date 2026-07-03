import { computed, reactive, ref } from 'vue'
import { getGenerationTask } from '@/api/generationTasks'

export type TrackedTaskStatus = 'pending' | 'running' | 'completed' | 'failed'

export interface TrackedTask {
  id: string
  label: string
  /** Free-form grouping key (e.g. a chapterId or episodeId) so UI can ask "is *this* thing busy". */
  scope?: string
  /** Free-form task category (e.g. 'event_extraction') so UI can ask "is any X running right now". */
  kind?: string
  /** Project this task belongs to, so the project list can show a per-project running count. */
  projectId?: string
  status: TrackedTaskStatus
  errorMessage: string | null
  createdAt: string
  startedAt: number
}

const tasks = reactive(new Map<string, TrackedTask>())
const drawerOpen = ref(false)
const timers = new Map<string, ReturnType<typeof setInterval>>()

function normalizeStatus(status: string): TrackedTaskStatus {
  if (status === 'completed' || status === 'failed') return status
  if (status === 'running') return 'running'
  return 'pending'
}

export interface RegisterTaskOptions {
  label: string
  scope?: string
  kind?: string
  projectId?: string
  onDone?: () => void
  onFailed?: (message: string | null) => void
}

/** Registers a fire-and-forget generation task for global polling; safe to call multiple times per taskId. */
function register(taskId: string, opts: RegisterTaskOptions) {
  if (timers.has(taskId)) return

  tasks.set(taskId, {
    id: taskId,
    label: opts.label,
    scope: opts.scope,
    kind: opts.kind,
    projectId: opts.projectId,
    status: 'pending',
    errorMessage: null,
    createdAt: new Date().toISOString(),
    startedAt: Date.now(),
  })

  const stop = () => {
    const timer = timers.get(taskId)
    if (timer) clearInterval(timer)
    timers.delete(taskId)
  }

  const tick = async () => {
    try {
      const task = await getGenerationTask(taskId)
      const status = normalizeStatus(task.status)
      const existing = tasks.get(taskId)
      if (!existing) return
      existing.status = status
      existing.errorMessage = task.errorMessage

      if (status === 'completed') {
        stop()
        opts.onDone?.()
      } else if (status === 'failed') {
        stop()
        opts.onFailed?.(task.errorMessage)
      }
    } catch {
      stop()
      const existing = tasks.get(taskId)
      if (existing) {
        existing.status = 'failed'
        existing.errorMessage = '轮询任务状态失败'
      }
      opts.onFailed?.('轮询任务状态失败')
    }
  }

  void tick()
  timers.set(taskId, setInterval(() => void tick(), 2500))
}

const list = computed(() =>
  Array.from(tasks.values()).sort((a, b) => b.startedAt - a.startedAt),
)

const runningCount = computed(
  () => list.value.filter((t) => t.status === 'pending' || t.status === 'running').length,
)

/** Running-task count for one project — only reflects tasks started this session (there's no server-side "list tasks" endpoint). */
function runningCountFor(projectId: string): number {
  return list.value.filter(
    (t) => t.projectId === projectId && (t.status === 'pending' || t.status === 'running'),
  ).length
}

function isScopeBusy(scope: string): boolean {
  return list.value.some(
    (t) => t.scope === scope && (t.status === 'pending' || t.status === 'running'),
  )
}

/** True if a task with this exact scope *and* kind is in flight (e.g. "is asset extraction running for episode X"). */
function isTaskBusy(scope: string, kind: string): boolean {
  return list.value.some(
    (t) => t.scope === scope && t.kind === kind && (t.status === 'pending' || t.status === 'running'),
  )
}

/** True if any task of this kind is in flight, optionally excluding one scope (e.g. "any *other* chapter extracting"). */
function isKindBusy(kind: string, excludeScope?: string): boolean {
  return list.value.some(
    (t) =>
      t.kind === kind &&
      t.scope !== excludeScope &&
      (t.status === 'pending' || t.status === 'running'),
  )
}

function toggleDrawer() {
  drawerOpen.value = !drawerOpen.value
}

/** Removes finished (completed/failed) tasks matching scope+kind — used before a retry so the stale failure doesn't linger. */
function dismiss(scope: string, kind: string) {
  for (const [id, task] of tasks) {
    if (task.scope === scope && task.kind === kind && task.status !== 'pending' && task.status !== 'running') {
      tasks.delete(id)
    }
  }
}

export function useTaskCenter() {
  return {
    tasks: list,
    runningCount,
    runningCountFor,
    drawerOpen,
    toggleDrawer,
    register,
    isScopeBusy,
    isKindBusy,
    isTaskBusy,
    dismiss,
  }
}
