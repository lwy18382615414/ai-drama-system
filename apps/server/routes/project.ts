import { Hono } from 'hono'
import type { Context } from 'hono'
import type { DatabaseClient } from '../../../packages/database/index.js'
import type { StructuredTextProvider } from '../../../packages/providers/index.js'
import type { TaskScheduler } from '../../../packages/tasks/index.js'
import { fail, internalError, invalidRequestBody, notFound, ok, serviceErrorCode } from '../api-response.js'
import {
  ChapterImportServiceError,
  ImportChaptersRequestSchema,
  importChapters,
} from '../services/chapter-import-service.js'
import {
  createProject,
  createProjectFromNovel,
  CreateProjectFromNovelRequestSchema,
  CreateProjectRequestSchema,
  deleteProject,
  getProjectChapters,
  getProjectDetail,
  listProjects,
  ProjectServiceError,
  updateProject,
  UpdateProjectRequestSchema,
} from '../services/project-service.js'

export interface ProjectRouteDeps {
  db: DatabaseClient
  provider: StructuredTextProvider
  scheduler: TaskScheduler
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

  app.post('/api/projects/:projectId/chapters/import', async (c) => {
    const body = await c.req.json().catch(() => null)
    const parsed = ImportChaptersRequestSchema.safeParse(body)

    if (!parsed.success) {
      return invalidRequestBody(c, parsed.error.issues)
    }

    try {
      const chapters = await importChapters(deps.db, c.req.param('projectId'), parsed.data)
      return ok(c, { chapters }, 201)
    } catch (error) {
      return handleServiceError(c, error)
    }
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

  app.post('/api/projects/from-novel', async (c) => {
    const body = await c.req.json().catch(() => null)
    const parsed = CreateProjectFromNovelRequestSchema.safeParse(body)

    if (!parsed.success) {
      return invalidRequestBody(c, parsed.error.issues)
    }

    try {
      const result = await createProjectFromNovel(
        { db: deps.db, provider: deps.provider, scheduler: deps.scheduler },
        parsed.data,
      )
      return ok(c, result, 201)
    } catch (error) {
      return handleServiceError(c, error)
    }
  })

  app.delete('/api/projects/:projectId', async (c) => {
    try {
      await deleteProject(deps.db, c.req.param('projectId'))
      return ok(c, null)
    } catch (error) {
      return handleServiceError(c, error)
    }
  })

  app.patch('/api/projects/:projectId', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const parsed = UpdateProjectRequestSchema.safeParse(body ?? {})

    if (!parsed.success) {
      return invalidRequestBody(c, parsed.error.issues)
    }

    try {
      const project = await updateProject(deps.db, c.req.param('projectId'), parsed.data)
      return ok(c, { project })
    } catch (error) {
      return handleServiceError(c, error)
    }
  })

  return app
}

function handleServiceError(c: Context, error: unknown) {
  if (error instanceof ProjectServiceError || error instanceof ChapterImportServiceError) {
    return fail(c, serviceErrorCode(error.statusCode), error.message, error.statusCode as 400 | 404 | 409)
  }

  return internalError(c, error)
}
