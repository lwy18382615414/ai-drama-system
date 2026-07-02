export interface SplitChapter {
  title: string | null
  content: string
  wordCount: number
}

/** Fallback chunk size (non-whitespace chars) when no chapter headings are detected. */
const FALLBACK_CHUNK_SIZE = 3000
/** Real chapter headings are short lines; longer lines are treated as body text. */
const MAX_HEADING_LENGTH = 50

interface HeadingPattern {
  regex: RegExp
  /** Bare numeric headings are ambiguous, so they need more evidence than explicit ones. */
  minMatches: number
}

const HEADING_PATTERNS: HeadingPattern[] = [
  // 第一章 / 第12回 / 第三卷 · 风起 — the chapter marker must be followed by
  // end-of-line, whitespace, or a separator so body prose like “第二天…” never matches.
  { regex: /^第[0-9一二三四五六七八九十百千万零两]{1,12}[章节回卷](?:$|[\s:：·.、\-—].*)/, minMatches: 1 },
  { regex: /^chapter\s+\d{1,4}(?:$|[\s:：.、\-—].*)/i, minMatches: 1 },
  // “1. 标题” / “12、标题” style — only trusted when it repeats.
  { regex: /^\d{1,4}[.、]\s*\S{1,30}$/, minMatches: 2 },
]

export function countWords(content: string): number {
  return content.replace(/\s+/g, '').length
}

export function splitNovelText(text: string): SplitChapter[] {
  const lines = text.split(/\r\n|\r|\n/)
  const pattern = pickHeadingPattern(lines)
  return pattern ? splitByHeadings(lines, pattern) : splitByLength(lines)
}

function isHeading(line: string, regex: RegExp): boolean {
  const trimmed = line.trim()
  return trimmed.length > 0 && trimmed.length <= MAX_HEADING_LENGTH && regex.test(trimmed)
}

function pickHeadingPattern(lines: string[]): RegExp | null {
  for (const { regex, minMatches } of HEADING_PATTERNS) {
    let matches = 0
    for (const line of lines) {
      if (isHeading(line, regex)) {
        matches += 1
        if (matches >= minMatches) return regex
      }
    }
  }
  return null
}

function splitByHeadings(lines: string[], regex: RegExp): SplitChapter[] {
  const chapters: SplitChapter[] = []
  let title: string | null = null
  let buffer: string[] = []

  const flush = () => {
    const content = buffer.join('\n').trim()
    // Skips empty bodies, which also absorbs table-of-contents blocks where
    // heading lines appear back-to-back before the real chapters start.
    if (content.length > 0) {
      chapters.push({ title, content, wordCount: countWords(content) })
    }
    buffer = []
  }

  for (const line of lines) {
    if (isHeading(line, regex)) {
      flush()
      title = line.trim()
    } else {
      buffer.push(line)
    }
  }
  flush()

  return chapters
}

function splitByLength(lines: string[]): SplitChapter[] {
  const chapters: SplitChapter[] = []
  let buffer: string[] = []
  let bufferWordCount = 0

  const flush = () => {
    const content = buffer.join('\n').trim()
    if (content.length > 0) {
      chapters.push({ title: null, content, wordCount: countWords(content) })
    }
    buffer = []
    bufferWordCount = 0
  }

  for (const line of lines) {
    buffer.push(line)
    bufferWordCount += countWords(line)
    if (bufferWordCount >= FALLBACK_CHUNK_SIZE) {
      flush()
    }
  }
  flush()

  return chapters
}
