import { Hono } from 'hono'
import type { Context } from 'hono'
import type { DatabaseClient } from '../../../packages/database/index.js'
import { fail, internalError, invalidRequestBody, notFound, ok, serviceErrorCode } from '../api-response.js'
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
    return ok(c, { projects })
  })

  app.get('/api/projects/:projectId', async (c) => {
    const project = await getProjectDetail(deps.db, c.req.param('projectId'))

    if (!project) {
      return notFound(c, 'Project not found')
    }

    return ok(c, { project })
  })

  app.get('/api/projects/:projectId/chapters', async (c) => {
    const result = await getProjectChapters(deps.db, c.req.param('projectId'))

    if (!result) {
      return notFound(c, 'Project not found')
    }

    return ok(c, { chapters: result.chapters })
  })

  app.post('/api/projects', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const parsed = CreateProjectRequestSchema.safeParse(body ?? {})

    if (!parsed.success) {
      return invalidRequestBody(c, parsed.error.issues)
    }

    try {
      const project = await createProject(deps.db, parsed.data)
      return ok(c, { project }, 201)
    } catch (error) {
      return handleServiceError(c, error)
    }
  })

  return app
}

function handleServiceError(c: Context, error: unknown) {
  if (error instanceof ProjectServiceError) {
    return fail(c, serviceErrorCode(error.statusCode), error.message, error.statusCode as 400 | 404 | 409)
  }

  return internalError(c, error)
}
