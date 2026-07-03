import { serve } from '@hono/node-server'
import { closeDatabase } from '../../packages/database/index.js'
import { createApp } from './app.js'

const port = Number(process.env.PORT ?? 3000)
const { app, db } = await createApp()

const server = serve({
  fetch: app.fetch,
  port,
})

console.log(`AI drama server listening on http://localhost:${port}`)

let shuttingDown = false
function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`Received ${signal}, shutting down...`)
  server.close(() => {
    closeDatabase(db)
    process.exit(0)
  })
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
