import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { buildEpubFixture } from '../test-helpers/epub-fixture.js'
import { createNovelRoutes } from './novel.js'

interface ApiResponse<T> {
  code: number
  message: string
  data: T
}

interface PreviewResponse {
  chapters: { title: string | null; content: string; wordCount: number }[]
  meta: { title: string | null; author: string | null } | null
}

function createTestApp() {
  const app = new Hono()
  app.route('/', createNovelRoutes())
  return app
}

function epubFormData(buffer: Buffer, filename = 'novel.epub') {
  const form = new FormData()
  form.append('file', new File([new Uint8Array(buffer)], filename, { type: 'application/epub+zip' }))
  return form
}

describe('novel routes', () => {
  it('previews chapter splitting from raw text', async () => {
    const app = createTestApp()

    const response = await app.request('/api/novel/preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: '第一章 深夜来电\n正文第一章。\n第二章 旧照片\n正文第二章。' }),
    })

    expect(response.status).toBe(200)
    const envelope = (await response.json()) as ApiResponse<PreviewResponse>
    expect(envelope.code).toBe(0)
    expect(envelope.data.chapters).toHaveLength(2)
    expect(envelope.data.chapters[0]).toMatchObject({ title: '第一章 深夜来电', content: '正文第一章。' })
    expect(envelope.data.meta).toBeNull()
  })

  it('rejects invalid text preview payloads', async () => {
    const app = createTestApp()

    const response = await app.request('/api/novel/preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: '' }),
    })

    expect(response.status).toBe(400)
    const envelope = (await response.json()) as ApiResponse<{ issues: unknown[] }>
    expect(envelope.code).toBe(40001)
  })

  it('previews chapters from an uploaded EPUB with metadata', async () => {
    const app = createTestApp()
    const buffer = await buildEpubFixture({
      chapters: [
        { id: 'c1', title: '第一章 开端', body: '<p>林晚推开门。</p>' },
        { id: 'c2', title: '第二章 转折', body: '<p>她收到了那封信。</p>' },
        { id: 'c3', title: '第三章 揭露', body: '<p>宴会上真相大白。</p>' },
      ],
    })

    const response = await app.request('/api/novel/preview-file', {
      method: 'POST',
      body: epubFormData(buffer),
    })

    expect(response.status).toBe(200)
    const envelope = (await response.json()) as ApiResponse<PreviewResponse>
    expect(envelope.code).toBe(0)
    expect(envelope.data.meta).toEqual({ title: '测试小说', author: '作者甲' })
    expect(envelope.data.chapters.map((chapter) => chapter.title)).toEqual([
      '第一章 开端',
      '第二章 转折',
      '第三章 揭露',
    ])
  })

  it('rejects non-epub uploads', async () => {
    const app = createTestApp()

    const response = await app.request('/api/novel/preview-file', {
      method: 'POST',
      body: epubFormData(Buffer.from('plain text'), 'novel.txt'),
    })

    expect(response.status).toBe(400)
    const envelope = (await response.json()) as ApiResponse<null>
    expect(envelope.code).toBe(40001)
    expect(envelope.message).toContain('.epub')
  })

  it('rejects DRM-protected EPUB uploads with 400', async () => {
    const app = createTestApp()
    const buffer = await buildEpubFixture({
      chapters: [{ id: 'c1', title: '第一章', body: '<p>正文。</p>' }],
      withEncryptionXml: true,
    })

    const response = await app.request('/api/novel/preview-file', {
      method: 'POST',
      body: epubFormData(buffer),
    })

    expect(response.status).toBe(400)
    const envelope = (await response.json()) as ApiResponse<null>
    expect(envelope.message).toContain('DRM')
  })

  it('rejects multipart requests without a file field', async () => {
    const app = createTestApp()
    const form = new FormData()
    form.append('other', 'value')

    const response = await app.request('/api/novel/preview-file', {
      method: 'POST',
      body: form,
    })

    expect(response.status).toBe(400)
    const envelope = (await response.json()) as ApiResponse<null>
    expect(envelope.message).toContain('file')
  })
})
