import { Hono } from 'hono'
import { createDatabase, initializeDatabase } from '../../packages/database/index.js'
import { MockStructuredTextProvider } from '../../packages/providers/index.js'
import { createEventAgentRoutes } from './routes/event-agent.js'

export async function createApp() {
  const db = await createDatabase(process.env.DATABASE_URL ?? 'data/ai-drama.sqlite')
  initializeDatabase(db)

  const provider = new MockStructuredTextProvider()
  const app = new Hono()

  app.get('/health', (c) => c.json({ ok: true }))
  app.route('/api/agents/event', createEventAgentRoutes({ db, provider }))

  return app
}
