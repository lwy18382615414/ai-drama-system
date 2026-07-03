import type { DatabaseClient } from '../../packages/database/index.js'
import type { ImageProvider, StructuredTextProvider } from '../../packages/providers/index.js'
import {
  runEpisodePlannerAgent,
  runEventAgent,
  runExtractAgent,
  runProjectProfileAgent,
  runScriptAgent,
  runStoryboardAgent,
} from '../../packages/agents/index.js'
import { TaskWorker, type TaskWorkerOptions } from '../../packages/tasks/index.js'
import { executeImageGeneration } from './services/image-generation-service.js'

export interface TaskWorkerDeps {
  db: DatabaseClient
  provider: StructuredTextProvider
  imageProvider: ImageProvider
}

/**
 * Builds the process's task worker and registers a handler per `taskType`. Each handler
 * reconstructs the runner input from the persisted `generation_tasks.inputJson` — nothing is
 * captured in memory — so any pending/interrupted task can be re-dispatched after a restart.
 * The runners themselves own the task's final status (completed/failed); the worker only claims,
 * dispatches, retries, and recovers.
 */
export function createTaskWorker(deps: TaskWorkerDeps, options?: TaskWorkerOptions): TaskWorker {
  const { db, provider, imageProvider } = deps
  const worker = new TaskWorker(db, options)

  worker.register('event_extraction', async (task) => {
    await runEventAgent({ db, provider, input: JSON.parse(task.inputJson) })
  })
  worker.register('episode_planning', async (task) => {
    await runEpisodePlannerAgent({ db, provider, input: JSON.parse(task.inputJson) })
  })
  worker.register('script_generation', async (task) => {
    await runScriptAgent({ db, provider, input: JSON.parse(task.inputJson) })
  })
  worker.register('asset_extraction', async (task) => {
    await runExtractAgent({ db, provider, input: JSON.parse(task.inputJson) })
  })
  worker.register('storyboard_generation', async (task) => {
    await runStoryboardAgent({ db, provider, input: JSON.parse(task.inputJson) })
  })
  worker.register('project_profile', async (task) => {
    await runProjectProfileAgent({ db, provider, input: JSON.parse(task.inputJson) })
  })
  worker.register('image_generation', async (task) => {
    const input = JSON.parse(task.inputJson)
    await executeImageGeneration(
      { db, imageProvider },
      {
        taskId: input.taskId ?? task.id,
        projectId: input.projectId,
        targetType: input.targetType,
        targetId: input.targetId,
        prompt: input.prompt,
        options: input.options ?? {},
        force: input.force ?? false,
      },
    )
  })

  return worker
}
