import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createDatabase, initializeDatabase } from '../../packages/database/index.js'
import {
  OpenAICompatibleImageProvider,
  OpenAICompatibleTextProvider,
  type ImageProvider,
  type StructuredTextProvider,
} from '../../packages/providers/index.js'
import { internalError, ok } from './api-response.js'

const STATIC_DIR = process.env.STATIC_DIR ?? 'data/static'
const STATIC_URL_BASE = '/static'
import { createAssetRoutes } from './routes/assets.js'
import { createEventAgentRoutes } from './routes/event-agent.js'
import { createEpisodePlannerRoutes } from './routes/episode-planner.js'
import { createNovelRoutes } from './routes/novel.js'
import { createProjectRoutes } from './routes/project.js'
import { createScriptRoutes } from './routes/script.js'
import { createStoryboardRoutes } from './routes/storyboard.js'
import { createImageGenerationRoutes } from './routes/image-generation.js'

export async function createApp() {
  const db = await createDatabase(process.env.DATABASE_URL ?? 'data/ai-drama.sqlite')
  initializeDatabase(db)

  const provider = createTextProvider()
  const imageProvider = createImageProvider()
  const app = new Hono()

  // Permissive CORS for the workbench frontend dev server (separate origin in MVP).
  app.use(
    '/api/*',
    cors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3100', credentials: false }),
  )

  // Serve generated images written to STATIC_DIR under /static.
  app.use(
    `${STATIC_URL_BASE}/*`,
    serveStatic({ root: STATIC_DIR, rewriteRequestPath: (p) => p.replace(/^\/static/, '') }),
  )

  app.onError((error, c) => internalError(c, error))

  app.get('/health', (c) => ok(c, { ok: true }))
  app.route('/', createNovelRoutes())
  app.route('/', createProjectRoutes({ db, provider }))
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
  const baseURL = process.env.TEXT_PROVIDER_BASE_URL
  if (!apiKey || !baseURL) {
    throw new Error(
      'Missing text provider configuration: set both TEXT_PROVIDER_API_KEY and TEXT_PROVIDER_BASE_URL',
    )
  }

  return new OpenAICompatibleTextProvider({
    baseURL,
    apiKey,
    model: process.env.TEXT_PROVIDER_MODEL ?? 'gpt-5.5',
  })
}

function createImageProvider(): ImageProvider {
  const apiKey = process.env.IMAGE_PROVIDER_API_KEY
  const baseURL = process.env.IMAGE_PROVIDER_BASE_URL
  if (!apiKey || !baseURL) {
    throw new Error(
      'Missing image provider configuration: set both IMAGE_PROVIDER_API_KEY and IMAGE_PROVIDER_BASE_URL',
    )
  }

  return new OpenAICompatibleImageProvider({
    baseURL,
    apiKey,
    model: process.env.IMAGE_PROVIDER_MODEL ?? 'gpt-image-2',
    staticDir: STATIC_DIR,
    staticUrlBase: STATIC_URL_BASE,
  })
}
