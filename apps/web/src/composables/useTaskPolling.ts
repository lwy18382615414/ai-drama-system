import { onUnmounted, ref, shallowRef, type Ref, type ShallowRef } from 'vue'

export interface TaskPollingOptions<T> {
  fetchStatus: (taskId: string) => Promise<T>
  isDone: (result: T) => boolean
  isFailed: (result: T) => boolean
  getErrorMessage?: (result: T) => string | null | undefined
  intervalMs?: number
  onDone?: (result: T) => void
  onFailed?: (result: T) => void
}

export interface TaskPollingControls<T> {
  start: (taskId: string) => void
  stop: () => void
  isPolling: Ref<boolean>
  lastResult: ShallowRef<T | null>
  error: Ref<string | null>
}

/** Polls a generation-task-shaped endpoint until it succeeds or fails, cleaning up on unmount. */
export function useTaskPolling<T>(opts: TaskPollingOptions<T>): TaskPollingControls<T> {
  const isPolling = ref(false)
  const lastResult = shallowRef<T | null>(null)
  const error = ref<string | null>(null)
  let timer: ReturnType<typeof setInterval> | null = null

  function stop() {
    if (timer) clearInterval(timer)
    timer = null
    isPolling.value = false
  }

  function start(taskId: string) {
    stop()
    error.value = null
    isPolling.value = true

    const tick = async () => {
      try {
        const result = await opts.fetchStatus(taskId)
        lastResult.value = result

        if (opts.isDone(result)) {
          stop()
          opts.onDone?.(result)
        } else if (opts.isFailed(result)) {
          stop()
          error.value = opts.getErrorMessage?.(result) ?? '任务失败'
          opts.onFailed?.(result)
        }
      } catch (e) {
        stop()
        error.value = e instanceof Error ? e.message : '轮询失败'
      }
    }

    void tick()
    timer = setInterval(() => void tick(), opts.intervalMs ?? 2000)
  }

  onUnmounted(stop)

  return { start, stop, isPolling, lastResult, error }
}
