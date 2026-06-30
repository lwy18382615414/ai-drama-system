import { serve } from '@hono/node-server'
import { createApp } from './app.js'

const port = Number(process.env.PORT ?? 3000)
const app = await createApp()

serve({
  fetch: app.fetch,
  port,
})

console.log(`AI drama server listening on http://localhost:${port}`)
