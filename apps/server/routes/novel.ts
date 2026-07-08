import { Hono } from 'hono'
import { ApiCode, fail, handleServiceError, invalidRequestBody, ok } from '../api-response.js'
import { previewChapters, PreviewChaptersRequestSchema } from '../services/chapter-import-service.js'
import { MAX_EPUB_FILE_SIZE, parseEpubNovel } from '../services/epub-import-service.js'

/**
 * Project-agnostic novel preview endpoints: they split raw input into chapter
 * candidates without persisting anything, so the create-project wizard can use
 * them before a project exists.
 */
export function createNovelRoutes() {
  const app = new Hono()

  app.post('/api/novel/preview', async (c) => {
    const body = await c.req.json().catch(() => null)
    const parsed = PreviewChaptersRequestSchema.safeParse(body)

    if (!parsed.success) {
      return invalidRequestBody(c, parsed.error.issues)
    }

    const chapters = previewChapters(parsed.data)
    return ok(c, { chapters, meta: null })
  })

  app.post('/api/novel/preview-file', async (c) => {
    const body = await c.req.parseBody().catch(() => null)
    const file = body?.file

    if (!(file instanceof File)) {
      return fail(c, ApiCode.InvalidRequestBody, 'Missing "file" field in multipart form data')
    }

    if (!file.name.toLowerCase().endsWith('.epub')) {
      return fail(c, ApiCode.InvalidRequestBody, 'Only .epub files are supported')
    }

    if (file.size > MAX_EPUB_FILE_SIZE) {
      return fail(
        c,
        ApiCode.PayloadTooLarge,
        `EPUB file exceeds the ${Math.floor(MAX_EPUB_FILE_SIZE / 1024 / 1024)}MB limit`,
      )
    }

    try {
      const buffer = Buffer.from(await file.arrayBuffer())
      const result = await parseEpubNovel(buffer)
      return ok(c, result)
    } catch (error) {
      return handleServiceError(c, error)
    }
  })

  return app
}
