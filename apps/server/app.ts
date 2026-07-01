import { Hono } from 'hono'
import { createDatabase, initializeDatabase } from '../../packages/database/index.js'
import { MockStructuredTextProvider } from '../../packages/providers/index.js'
import { createAssetRoutes } from './routes/assets.js'
import { createEventAgentRoutes } from './routes/event-agent.js'
import { createEpisodePlannerRoutes } from './routes/episode-planner.js'
import { createScriptRoutes } from './routes/script.js'
import { createStoryboardRoutes } from './routes/storyboard.js'

export async function createApp() {
  const db = await createDatabase(process.env.DATABASE_URL ?? 'data/ai-drama.sqlite')
  initializeDatabase(db)

  const provider = new MockStructuredTextProvider()
  const app = new Hono()

  app.get('/health', (c) => c.json({ ok: true }))
  app.route('/api/agents/event', createEventAgentRoutes({ db, provider }))
  app.route('/', createEpisodePlannerRoutes({ db, provider }))
  app.route('/', createScriptRoutes({ db, provider }))
  app.route('/', createAssetRoutes({ db, provider }))
  app.route('/', createStoryboardRoutes({ db, provider }))

  return app
}
