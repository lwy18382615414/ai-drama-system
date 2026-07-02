import { describe, expect, it } from 'vitest'
import { splitNovelText } from './novel-splitter.js'

describe('splitNovelText', () => {
  it('splits chapters on 第X章 headings with Chinese numerals', () => {
    const text = [
      '第一章 深夜来电',
      '林晚接到电话的时候，窗外正下着雨。',
      '她犹豫了很久才接起。',
      '第二章 旧照片',
      '抽屉深处压着一张泛黄的照片。',
      '第十三章 真相',
      '一切都对上了。',
    ].join('\n')

    const chapters = splitNovelText(text)

    expect(chapters).toHaveLength(3)
    expect(chapters[0].title).toBe('第一章 深夜来电')
    expect(chapters[0].content).toBe('林晚接到电话的时候，窗外正下着雨。\n她犹豫了很久才接起。')
    expect(chapters[0].wordCount).toBe('林晚接到电话的时候，窗外正下着雨。她犹豫了很久才接起。'.length)
    expect(chapters[1].title).toBe('第二章 旧照片')
    expect(chapters[2].title).toBe('第十三章 真相')
  })

  it('splits chapters on English Chapter N headings', () => {
    const text = ['Chapter 1 The Call', 'It was raining.', 'Chapter 2', 'The photo was old.'].join('\n')

    const chapters = splitNovelText(text)

    expect(chapters).toHaveLength(2)
    expect(chapters[0].title).toBe('Chapter 1 The Call')
    expect(chapters[1].title).toBe('Chapter 2')
    expect(chapters[1].content).toBe('The photo was old.')
  })

  it('keeps text before the first heading as an untitled chapter', () => {
    const text = ['这是一段没有标题的引子，交代了故事背景。', '第一章 开端', '正文开始。'].join('\n')

    const chapters = splitNovelText(text)

    expect(chapters).toHaveLength(2)
    expect(chapters[0].title).toBeNull()
    expect(chapters[0].content).toBe('这是一段没有标题的引子，交代了故事背景。')
    expect(chapters[1].title).toBe('第一章 开端')
  })

  it('drops empty chapters produced by table-of-contents heading runs', () => {
    const text = [
      '第一章 深夜来电',
      '第二章 旧照片',
      '',
      '第一章 深夜来电',
      '正文第一章内容。',
      '第二章 旧照片',
      '正文第二章内容。',
    ].join('\n')

    const chapters = splitNovelText(text)

    expect(chapters).toHaveLength(2)
    expect(chapters.every((chapter) => chapter.content.length > 0)).toBe(true)
    expect(chapters[0].content).toBe('正文第一章内容。')
    expect(chapters[1].content).toBe('正文第二章内容。')
  })

  it('does not treat body prose starting with 第X as a heading', () => {
    const text = ['第一章 开端', '第二天早上他就出发了。', '第三章的伏笔在这里埋下，谁也没有察觉。'].join('\n')

    const chapters = splitNovelText(text)

    expect(chapters).toHaveLength(1)
    expect(chapters[0].content).toContain('第二天早上他就出发了。')
    expect(chapters[0].content).toContain('第三章的伏笔在这里埋下，谁也没有察觉。')
  })

  it('requires repeated evidence before trusting bare numeric headings', () => {
    const single = ['开头的段落。', '1. 这行只出现一次', '后面的段落。'].join('\n')
    expect(splitNovelText(single)).toHaveLength(1)

    const repeated = ['1. 开端', '第一段正文。', '2. 转折', '第二段正文。'].join('\n')
    const chapters = splitNovelText(repeated)
    expect(chapters).toHaveLength(2)
    expect(chapters[0].title).toBe('1. 开端')
  })

  it('falls back to fixed-size chunking when no headings are found', () => {
    const paragraph = '这一行大约有二十个非空白字符左右吧。'
    const lines = Array.from({ length: 400 }, () => paragraph)
    const text = lines.join('\n')

    const chapters = splitNovelText(text)

    expect(chapters.length).toBeGreaterThan(1)
    expect(chapters.every((chapter) => chapter.title === null)).toBe(true)
    expect(chapters.every((chapter) => chapter.wordCount > 0)).toBe(true)
    const totalWords = chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0)
    expect(totalWords).toBe(paragraph.length * lines.length)
  })

  it('returns an empty list for blank input', () => {
    expect(splitNovelText('')).toHaveLength(0)
    expect(splitNovelText('  \n\n  ')).toHaveLength(0)
  })
})
