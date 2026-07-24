import { serve } from '@hono/node-server'
import { closeDatabase } from '../../packages/database/index.js'
import { createApp } from './app.js'
import { sweepActivePipelineRuns } from './services/pipeline-run-service.js'

const port = Number(process.env.PORT ?? 3000)
const { app, db, worker, provider } = await createApp()

const server = serve({
  fetch: app.fetch,
  port,
})

// Safety-net for the post-settle hook: periodically re-advance active runs so a run whose
// last settle-hook advance threw (or was missed) still resumes without a restart.
const pipelineSweepMs = Number(process.env.PIPELINE_SWEEP_INTERVAL_MS ?? 30_000)
const pipelineSweepTimer = setInterval(() => {
  void sweepActivePipelineRuns({ db, provider, scheduler: worker })
}, pipelineSweepMs)
pipelineSweepTimer.unref?.()

console.log(`AI drama server listening on http://localhost:${port}`)

let shuttingDown = false
function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`Received ${signal}, shutting down...`)
  server.close(() => {
    clearInterval(pipelineSweepTimer)
    worker.stop()
    closeDatabase(db)
    process.exit(0)
  })
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
