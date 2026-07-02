import { describe, expect, it } from 'vitest'
import { buildEpubFixture } from '../test-helpers/epub-fixture.js'
import {
  EpubImportServiceError,
  MAX_EPUB_FILE_SIZE,
  parseEpubNovel,
} from './epub-import-service.js'

async function expectServiceError(promise: Promise<unknown>, statusCode: number, messagePart: string) {
  const error = await promise.then(
    () => null,
    (thrown: unknown) => thrown,
  )
  expect(error).toBeInstanceOf(EpubImportServiceError)
  expect((error as EpubImportServiceError).statusCode).toBe(statusCode)
  expect((error as EpubImportServiceError).message).toContain(messagePart)
}

describe('parseEpubNovel', () => {
  it('splits a structured EPUB by spine sections with TOC titles and metadata', async () => {
    const buffer = await buildEpubFixture({
      chapters: [
        { id: 'c1', title: '第一章 开端', body: '<p>林晚推开门。</p><p>屋里一片漆黑。</p>' },
        { id: 'c2', title: '第二章 转折', body: '<p>第二天清晨，她收到了那封信。</p>' },
        { id: 'c3', title: '第三章 揭露', body: '<p>宴会上真相大白。</p>' },
      ],
    })

    const result = await parseEpubNovel(buffer)

    expect(result.meta).toEqual({ title: '测试小说', author: '作者甲' })
    expect(result.chapters).toHaveLength(3)
    expect(result.chapters.map((chapter) => chapter.title)).toEqual([
      '第一章 开端',
      '第二章 转折',
      '第三章 揭露',
    ])
    expect(result.chapters[0]!.content).toContain('林晚推开门。')
    expect(result.chapters[0]!.content).not.toContain('<p>')
    expect(result.chapters[0]!.wordCount).toBeGreaterThan(0)
  })

  it('falls back to heading detection when the whole book sits in one spine item', async () => {
    const body = [
      '<p>第一章 深夜来电</p>',
      '<p>电话铃声在午夜响起。</p>',
      '<p>第二章 旧照片</p>',
      '<p>抽屉里藏着一张泛黄的照片。</p>',
      '<p>第三章 对峙</p>',
      '<p>两人在天台针锋相对。</p>',
    ].join('')

    const buffer = await buildEpubFixture({
      chapters: [{ id: 'all', title: '全文', body }],
    })

    const result = await parseEpubNovel(buffer)

    expect(result.chapters).toHaveLength(3)
    expect(result.chapters.map((chapter) => chapter.title)).toEqual([
      '第一章 深夜来电',
      '第二章 旧照片',
      '第三章 对峙',
    ])
  })

  it('re-splits an oversized section by headings while keeping normal sections intact', async () => {
    const longParagraph = '她沿着长街走了很久很久。'.repeat(500)
    const oversizedBody = [
      '<p>第十章 迷雾</p>',
      `<p>${longParagraph}</p>`,
      '<p>第十一章 灯塔</p>',
      `<p>${longParagraph}</p>`,
    ].join('')

    const buffer = await buildEpubFixture({
      chapters: [
        { id: 'c1', title: '第一章', body: '<p>普通的一章。</p>' },
        { id: 'c2', title: '合并卷', body: oversizedBody },
        { id: 'c3', title: '第十二章', body: '<p>普通的另一章。</p>' },
      ],
    })

    const result = await parseEpubNovel(buffer)

    expect(result.chapters.length).toBe(4)
    expect(result.chapters.map((chapter) => chapter.title)).toEqual([
      '第一章',
      '第十章 迷雾',
      '第十一章 灯塔',
      '第十二章',
    ])
  })

  it('rejects DRM-protected EPUB files with 400', async () => {
    const buffer = await buildEpubFixture({
      chapters: [{ id: 'c1', title: '第一章', body: '<p>正文。</p>' }],
      withEncryptionXml: true,
    })

    await expectServiceError(parseEpubNovel(buffer), 400, 'DRM')
  })

  it('rejects files above the size limit with 413', async () => {
    const buffer = Buffer.alloc(MAX_EPUB_FILE_SIZE + 1)

    await expectServiceError(parseEpubNovel(buffer), 413, 'limit')
  })

  it('rejects files that are not valid EPUB archives with 400', async () => {
    const buffer = Buffer.from('definitely not a zip file')

    await expectServiceError(parseEpubNovel(buffer), 400, 'Failed to parse EPUB')
  })
})
