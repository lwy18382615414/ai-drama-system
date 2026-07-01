import { Hono } from 'hono'
import type { Context } from 'hono'
import type { DatabaseClient } from '../../../packages/database/index.js'
import {
  createProject,
  CreateProjectRequestSchema,
  getProjectChapters,
  getProjectDetail,
  listProjects,
  ProjectServiceError,
} from '../services/project-service.js'

export interface ProjectRouteDeps {
  db: DatabaseClient
}

export function createProjectRoutes(deps: ProjectRouteDeps) {
  const app = new Hono()

  app.get('/api/projects', async (c) => {
    const projects = await listProjects(deps.db)
    return c.json({ projects })
  })

  app.get('/api/projects/:projectId', async (c) => {
    const project = await getProjectDetail(deps.db, c.req.param('projectId'))

    if (!project) {
      return c.json({ error: 'Project not found' }, 404)
    }

    return c.json({ project })
  })

  app.get('/api/projects/:projectId/chapters', async (c) => {
    const result = await getProjectChapters(deps.db, c.req.param('projectId'))

    if (!result) {
      return c.json({ error: 'Project not found' }, 404)
    }

    return c.json({ chapters: result.chapters })
  })

  app.post('/api/projects', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const parsed = CreateProjectRequestSchema.safeParse(body ?? {})

    if (!parsed.success) {
      return c.json({ error: 'Invalid request body', issues: parsed.error.issues }, 400)
    }

    try {
      const project = await createProject(deps.db, parsed.data)
      return c.json({ project }, 201)
    } catch (error) {
      return handleServiceError(c, error)
    }
  })

  return app
}

function handleServiceError(c: Context, error: unknown) {
  if (error instanceof ProjectServiceError) {
    return c.json({ error: error.message }, error.statusCode as 400 | 404 | 409)
  }

  if (error instanceof Error) {
    return c.json({ error: error.message }, 500)
  }

  return c.json({ error: String(error) }, 500)
}
