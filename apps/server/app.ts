import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createDatabase, initializeDatabase } from '../../packages/database/index.js'
import {
  MockImageProvider,
  MockStructuredTextProvider,
  OpenAICompatibleTextProvider,
  type StructuredTextProvider,
} from '../../packages/providers/index.js'
import { createAssetRoutes } from './routes/assets.js'
import { createEventAgentRoutes } from './routes/event-agent.js'
import { createEpisodePlannerRoutes } from './routes/episode-planner.js'
import { createProjectRoutes } from './routes/project.js'
import { createScriptRoutes } from './routes/script.js'
import { createStoryboardRoutes } from './routes/storyboard.js'
import { createImageGenerationRoutes } from './routes/image-generation.js'

export async function createApp() {
  const db = await createDatabase(process.env.DATABASE_URL ?? 'data/ai-drama.sqlite')
  initializeDatabase(db)

  const provider = createTextProvider()
  const imageProvider = new MockImageProvider()
  const app = new Hono()

  // Permissive CORS for the workbench frontend dev server (separate origin in MVP).
  app.use(
    '/api/*',
    cors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3100', credentials: false }),
  )

  app.get('/health', (c) => c.json({ ok: true }))
  app.route('/', createProjectRoutes({ db }))
  app.route('/api/agents/event', createEventAgentRoutes({ db, provider }))
  app.route('/', createEpisodePlannerRoutes({ db, provider }))
  app.route('/', createScriptRoutes({ db, provider }))
  app.route('/', createAssetRoutes({ db, provider }))
  app.route('/', createStoryboardRoutes({ db, provider }))
  app.route('/', createImageGenerationRoutes({ db, imageProvider }))

  return app
}

function createTextProvider(): StructuredTextProvider {
  const apiKey = process.env.TEXT_PROVIDER_API_KEY
  if (!apiKey) {
    return new MockStructuredTextProvider()
  }

  const baseURL = process.env.TEXT_PROVIDER_BASE_URL
  if (!baseURL) {
    throw new Error('TEXT_PROVIDER_API_KEY is set but TEXT_PROVIDER_BASE_URL is missing')
  }

  return new OpenAICompatibleTextProvider({
    baseURL,
    apiKey,
    model: process.env.TEXT_PROVIDER_MODEL ?? 'gpt-5.5',
  })
}
