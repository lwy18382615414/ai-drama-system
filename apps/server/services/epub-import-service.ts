import { parseEpub } from '@gxl/epub-parser'
import { convert } from 'html-to-text'
import { countWords, splitNovelText, type SplitChapter } from './novel-splitter.js'

/** Upload size cap for .epub files; requests above this are rejected with 413. */
export const MAX_EPUB_FILE_SIZE = 30 * 1024 * 1024
/** A "chapter" longer than this is likely an unsplit multi-chapter blob → re-split by headings. */
export const RESPLIT_WORD_THRESHOLD = 10_000
/** EPUBs with fewer content sections than this carry no usable chapter structure. */
const MIN_STRUCTURED_SECTIONS = 3

export class EpubImportServiceError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message)
  }
}

export interface EpubMeta {
  title: string | null
  author: string | null
}

export interface EpubImportResult {
  chapters: SplitChapter[]
  meta: EpubMeta
}

interface TocNode {
  name?: string
  sectionId?: string
  path?: string
  children?: TocNode[]
}

interface ManifestItem {
  id?: string
  href?: string
}

export async function parseEpubNovel(buffer: Buffer): Promise<EpubImportResult> {
  if (buffer.length > MAX_EPUB_FILE_SIZE) {
    throw new EpubImportServiceError(
      `EPUB file exceeds the ${Math.floor(MAX_EPUB_FILE_SIZE / 1024 / 1024)}MB limit`,
      413,
    )
  }

  let epub: Awaited<ReturnType<typeof parseEpub>>
  try {
    epub = await parseEpub(buffer, { type: 'buffer' })
  } catch (error) {
    throw new EpubImportServiceError(
      `Failed to parse EPUB file: ${error instanceof Error ? error.message : String(error)}`,
      400,
    )
  }

  if (hasDrmEncryption(epub)) {
    throw new EpubImportServiceError('This EPUB is DRM-protected; please provide an unencrypted copy', 400)
  }

  const titleBySectionId = collectTocTitles(
    epub.structure as TocNode[] | undefined,
    (epub as unknown as { _manifest?: ManifestItem[] })._manifest ?? [],
  )
  const sections: SplitChapter[] = []

  for (const section of epub.sections ?? []) {
    const content = htmlToNovelText(section.htmlString)
    if (!content) {
      continue
    }

    sections.push({
      title: titleBySectionId.get(section.id) ?? null,
      content,
      wordCount: countWords(content),
    })
  }

  if (sections.length === 0) {
    throw new EpubImportServiceError('EPUB contains no readable text content', 400)
  }

  const meta: EpubMeta = {
    title: cleanMetaText(epub.info?.title),
    author: cleanMetaText(epub.info?.author),
  }

  // Conversion artifacts often pack the whole book into one or two spine items;
  // in that case the EPUB structure is useless, so fall back to heading detection.
  if (sections.length < MIN_STRUCTURED_SECTIONS) {
    const fullText = sections.map((section) => section.content).join('\n\n')
    return { chapters: splitNovelText(fullText), meta }
  }

  const chapters = sections.flatMap((section) =>
    section.wordCount > RESPLIT_WORD_THRESHOLD ? resplitOversizedSection(section) : [section],
  )

  return { chapters, meta }
}

/** An oversized "chapter" gets re-split by headings; keep it intact when no headings are found. */
function resplitOversizedSection(section: SplitChapter): SplitChapter[] {
  const resplit = splitNovelText(section.content)

  if (resplit.length <= 1) {
    return [section]
  }

  // Length-based fallback chunks carry no titles; label them after the section
  // so the preview table stays navigable.
  return resplit.map((chapter, index) => ({
    ...chapter,
    title: chapter.title ?? (section.title ? `${section.title}（${index + 1}）` : null),
  }))
}

function hasDrmEncryption(epub: { resolve: (path: string) => { asText: () => string } }): boolean {
  try {
    epub.resolve('/META-INF/encryption.xml')
    return true
  } catch {
    return false
  }
}

/**
 * Maps section ids to TOC titles. `sectionId` on structure nodes is always
 * undefined because @gxl/epub-parser builds the structure before assigning its
 * manifest (upstream bug), so resolve ids ourselves by matching the TOC entry
 * path against manifest hrefs.
 */
function collectTocTitles(nodes: TocNode[] | undefined, manifest: ManifestItem[]): Map<string, string> {
  const idByFileName = new Map<string, string>()
  for (const item of manifest) {
    if (item.id && item.href) {
      idByFileName.set(toFileName(item.href), item.id)
    }
  }

  const titles = new Map<string, string>()

  const walk = (items: TocNode[] | undefined) => {
    for (const item of items ?? []) {
      const name = cleanMetaText(item.name)
      const sectionId = item.sectionId ?? (item.path ? idByFileName.get(toFileName(item.path)) : undefined)
      if (sectionId && name && !titles.has(sectionId)) {
        titles.set(sectionId, name)
      }
      walk(item.children)
    }
  }

  walk(nodes)
  return titles
}

/** Normalizes an href/TOC src to its bare file name (no directories, no #anchor). */
function toFileName(href: string): string {
  const withoutHash = href.split('#')[0] ?? href
  return withoutHash.slice(withoutHash.lastIndexOf('/') + 1)
}

function htmlToNovelText(htmlString: string): string {
  const text = convert(htmlString, {
    wordwrap: false,
    selectors: [
      { selector: 'img', format: 'skip' },
      { selector: 'a', options: { ignoreHref: true } },
    ],
  })

  // Collapse the 3+ blank lines html-to-text emits between block elements.
  return text.replace(/\n{3,}/g, '\n\n').trim()
}

function cleanMetaText(value: string | undefined | null): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}
