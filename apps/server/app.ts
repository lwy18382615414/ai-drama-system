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
import { internalError, ok, routeNotFound } from './api-response.js'
import { createTaskWorker } from './tasks.js'

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
import { createTaskStreamRoutes } from './routes/task-stream.js'

export async function createApp() {
  const db = await createDatabase(process.env.DATABASE_URL ?? 'data/ai-drama.sqlite')
  await initializeDatabase(db)

  const provider = createTextProvider()
  const imageProvider = createImageProvider()

  // Database-backed task worker replaces in-request fire-and-forget: start* handlers only
  // enqueue a generation_tasks row and notify(); the worker claims, runs, retries, and
  // recovers pending/interrupted tasks on startup.
  const worker = createTaskWorker({ db, provider, imageProvider }, resolveWorkerOptions())
  worker.start()

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
  app.notFound((c) => routeNotFound(c))

  app.get('/health', (c) => ok(c, { ok: true }))
  app.route('/', createNovelRoutes())
  app.route('/', createProjectRoutes({ db, provider, scheduler: worker }))
  app.route('/api/agents/event', createEventAgentRoutes({ db, provider, scheduler: worker }))
  app.route('/', createEpisodePlannerRoutes({ db, provider, scheduler: worker }))
  app.route('/', createScriptRoutes({ db, provider, scheduler: worker }))
  app.route('/', createAssetRoutes({ db, provider, scheduler: worker }))
  app.route('/', createStoryboardRoutes({ db, provider, scheduler: worker }))
  app.route('/', createImageGenerationRoutes({ db, imageProvider, scheduler: worker }))
  app.route('/', createTaskStreamRoutes({ db, bus: worker }))

  return { app, db, worker }
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

  const model = process.env.IMAGE_PROVIDER_MODEL ?? 'gpt-image-2'
  // Volcengine Ark Seedream models take a resolution tier (`2K`) as `size`
  // instead of pixel dimensions. Auto-detect by model name, overridable via env.
  const sizeMode =
    process.env.IMAGE_PROVIDER_SIZE_MODE === 'tier' ||
    process.env.IMAGE_PROVIDER_SIZE_MODE === 'pixels'
      ? process.env.IMAGE_PROVIDER_SIZE_MODE
      : /seedream|seededit/i.test(model)
        ? 'tier'
        : 'pixels'

  // Resolution tier for `sizeMode: 'tier'`. Lower tiers (1K) generate markedly
  // faster since model inference dominates latency. Defaults to 2K.
  const sizeTier =
    process.env.IMAGE_PROVIDER_SIZE_TIER === '1K' ||
    process.env.IMAGE_PROVIDER_SIZE_TIER === '2K' ||
    process.env.IMAGE_PROVIDER_SIZE_TIER === '4K'
      ? process.env.IMAGE_PROVIDER_SIZE_TIER
      : '2K'

  return new OpenAICompatibleImageProvider({
    baseURL,
    apiKey,
    model,
    staticDir: STATIC_DIR,
    staticUrlBase: STATIC_URL_BASE,
    sizeMode,
    sizeTier,
  })
}

/**
 * Task worker knobs from env. `TASK_WORKER_CONCURRENCY` bounds how many generation
 * tasks (incl. storyboard frames) run at once — the main lever for batch image
 * throughput, since each Seedream frame takes tens of seconds. Falls back to the
 * worker's own defaults when unset/invalid.
 */
function resolveWorkerOptions() {
  const options: { concurrency?: number } = {}
  const raw = process.env.TASK_WORKER_CONCURRENCY
  if (raw !== undefined) {
    const parsed = Number.parseInt(raw, 10)
    if (Number.isInteger(parsed) && parsed > 0) {
      options.concurrency = parsed
    }
  }
  return options
}
