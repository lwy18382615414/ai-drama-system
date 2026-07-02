import JSZip from 'jszip'

export interface FixtureChapter {
  id: string
  title: string
  body: string
}

export interface EpubFixtureOptions {
  chapters: FixtureChapter[]
  title?: string
  author?: string
  withNcx?: boolean
  withEncryptionXml?: boolean
}

/** Builds a minimal valid EPUB 2 archive in memory for tests. */
export async function buildEpubFixture(options: EpubFixtureOptions): Promise<Buffer> {
  const { chapters, title = '测试小说', author = '作者甲', withNcx = true, withEncryptionXml = false } = options
  const zip = new JSZip()

  zip.file('mimetype', 'application/epub+zip')
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
  )

  if (withEncryptionXml) {
    zip.file(
      'META-INF/encryption.xml',
      '<?xml version="1.0"?><encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container"/>',
    )
  }

  const manifestItems = chapters
    .map((chapter) => `<item id="${chapter.id}" href="${chapter.id}.xhtml" media-type="application/xhtml+xml"/>`)
    .join('\n    ')
  const spineItems = chapters.map((chapter) => `<itemref idref="${chapter.id}"/>`).join('\n    ')

  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${title}</dc:title>
    <dc:creator>${author}</dc:creator>
  </metadata>
  <manifest>
    ${withNcx ? '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>' : ''}
    ${manifestItems}
  </manifest>
  <spine${withNcx ? ' toc="ncx"' : ''}>
    ${spineItems}
  </spine>
</package>`,
  )

  if (withNcx) {
    const navPoints = chapters
      .map(
        (chapter, index) => `<navPoint id="nav-${chapter.id}" playOrder="${index + 1}">
      <navLabel><text>${chapter.title}</text></navLabel>
      <content src="${chapter.id}.xhtml"/>
    </navPoint>`,
      )
      .join('\n    ')

    zip.file(
      'OEBPS/toc.ncx',
      `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <navMap>
    ${navPoints}
  </navMap>
</ncx>`,
    )
  }

  for (const chapter of chapters) {
    zip.file(
      `OEBPS/${chapter.id}.xhtml`,
      `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>${chapter.title}</title></head>
  <body>${chapter.body}</body>
</html>`,
    )
  }

  return zip.generateAsync({ type: 'nodebuffer' })
}
