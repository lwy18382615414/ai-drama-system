import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { nanoid } from 'nanoid'
import { OpenAI } from 'openai'
import type { ImageGenerationRequest, ImageGenerationResult, ImageProvider } from './image-provider.js'

export interface OpenAICompatibleImageProviderOptions {
  baseURL: string
  apiKey: string
  model: string
  /** Directory on disk where generated images are written. */
  staticDir: string
  /** URL prefix under which `staticDir` is served. Defaults to `/static`. */
  staticUrlBase?: string
  /**
   * How the `size` request parameter is expressed. OpenAI/gpt-image models take
   * fixed pixel dimensions (`1024x1024`); Volcengine Ark Seedream models take a
   * resolution tier string (`1K`/`2K`/`4K`). Defaults to `pixels`.
   */
  sizeMode?: 'pixels' | 'tier'
  /**
   * Resolution tier used when `sizeMode` is `tier`. Lower tiers generate much
   * faster (inference time dominates end-to-end latency). Defaults to `2K`.
   */
  sizeTier?: SeedreamSizeTier
}

type OpenAIImageSize = '256x256' | '512x512' | '1024x1024' | '1536x1024' | '1024x1536'
type SeedreamSizeTier = '1K' | '2K' | '4K'

export class OpenAICompatibleImageProvider implements ImageProvider {
  readonly name = 'openai-compatible'
  readonly model: string

  private readonly client: OpenAI
  private readonly staticDir: string
  private readonly staticUrlBase: string
  private readonly sizeMode: 'pixels' | 'tier'
  private readonly sizeTier: SeedreamSizeTier

  constructor(options: OpenAICompatibleImageProviderOptions) {
    this.model = options.model
    this.client = new OpenAI({ baseURL: options.baseURL, apiKey: options.apiKey })
    this.staticDir = options.staticDir
    this.staticUrlBase = (options.staticUrlBase ?? '/static').replace(/\/$/, '')
    this.sizeMode = options.sizeMode ?? 'pixels'
    this.sizeTier = options.sizeTier ?? '2K'
  }

  async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    // Seedream reports resolution tiers (`2K`) that fall outside the OpenAI SDK's
    // `size` literal union, so cast through the SDK's expected type.
    const size = this.resolveSize(request) as unknown as OpenAIImageSize

    // Reference images drive Seedream subject/scene consistency. They ride on a
    // non-standard `image` field the OpenAI SDK doesn't type, so we widen the
    // params. Verified against the configured proxy: it passes `image` through and
    // the model honors base64 data URIs. Omitted when there are no references, so
    // pure text-to-image is unchanged.
    // Temporary timing instrumentation to locate the storyboard-frame bottleneck:
    // reference encoding vs. model round-trip vs. download+write. Remove once diagnosed.
    const timingTag = `[img-timing task=${String(request.metadata?.taskId ?? '?')} type=${String(request.metadata?.targetType ?? '?')}]`

    const encodeStart = Date.now()
    const referenceImages = await this.resolveReferenceImages(request.referenceImages)
    const encodeMs = Date.now() - encodeStart
    const refBytes = referenceImages.reduce((sum, ref) => sum + ref.length, 0)
    console.log(
      `${timingTag} encode: ${referenceImages.length} refs, ~${(refBytes / 1024 / 1024).toFixed(2)}MB base64, ${encodeMs}ms`,
    )

    const params: Record<string, unknown> = {
      model: this.model,
      prompt: this.buildPrompt(request),
      size,
      n: 1,
    }
    if (referenceImages.length > 0) {
      params.image = referenceImages
    }

    const requestStart = Date.now()
    const response = await this.client.images.generate(
      params as unknown as Parameters<OpenAI['images']['generate']>[0],
    )
    console.log(`${timingTag} model round-trip (upload+inference): ${Date.now() - requestStart}ms`)

    const image = response.data?.[0]
    if (!image) {
      throw new Error(`OpenAICompatibleImageProvider received no image from model "${this.model}"`)
    }

    const downloadStart = Date.now()
    const bytes = await this.resolveImageBytes(image)
    const targetType = String(request.metadata?.targetType ?? 'image')
    const filename = `${targetType}-${nanoid()}.png`

    await mkdir(this.staticDir, { recursive: true })
    await writeFile(path.join(this.staticDir, filename), bytes)
    console.log(`${timingTag} download+write result image: ${Date.now() - downloadStart}ms`)

    return {
      imageUrl: `${this.staticUrlBase}/${filename}`,
      provider: this.name,
      model: this.model,
      raw: response,
    }
  }

  /**
   * The images API has no dedicated negative-prompt or style fields, so fold
   * them into the prompt text.
   */
  private buildPrompt(request: ImageGenerationRequest): string {
    const parts = [request.prompt]
    if (request.style) {
      parts.push(`Style: ${request.style}.`)
    }
    if (request.negativePrompt) {
      parts.push(`Avoid: ${request.negativePrompt}.`)
    }
    return parts.join('\n')
  }

  /**
   * Resolves each reference to a base64 data URI so the model receives the pixels
   * directly — no public hosting of `staticDir` required. Accepts served asset URLs
   * (`/static/x.png`), absolute local paths, and remote `http(s)` URLs.
   */
  private async resolveReferenceImages(references?: string[]): Promise<string[]> {
    if (!references || references.length === 0) {
      return []
    }

    const resolved: string[] = []
    for (const ref of references) {
      if (ref.startsWith('data:')) {
        resolved.push(ref)
        continue
      }

      let bytes: Buffer
      if (ref.startsWith('http://') || ref.startsWith('https://')) {
        const res = await fetch(ref)
        if (!res.ok) {
          throw new Error(`Failed to fetch reference image "${ref}": HTTP ${res.status}`)
        }
        bytes = Buffer.from(await res.arrayBuffer())
      } else {
        // `/static/x.png` (served URL) → `staticDir/x.png`; otherwise treat as a path.
        const filePath = ref.startsWith(`${this.staticUrlBase}/`)
          ? path.join(this.staticDir, ref.slice(this.staticUrlBase.length + 1))
          : ref
        bytes = await readFile(filePath)
      }

      resolved.push(`data:${mimeTypeForPath(ref)};base64,${bytes.toString('base64')}`)
    }

    return resolved
  }

  private resolveSize(request: ImageGenerationRequest): OpenAIImageSize | SeedreamSizeTier {
    // Volcengine Ark Seedream expresses size as a resolution tier rather than
    // fixed pixel dimensions, and derives the aspect ratio from the prompt.
    if (this.sizeMode === 'tier') {
      return this.sizeTier
    }

    const width = request.width
    const height = request.height
    if (!width || !height) {
      return '1024x1024'
    }
    if (width === height) {
      return '1024x1024'
    }
    return width > height ? '1536x1024' : '1024x1536'
  }

  private async resolveImageBytes(image: { b64_json?: string; url?: string }): Promise<Buffer> {
    if (image.b64_json) {
      return Buffer.from(image.b64_json, 'base64')
    }

    if (image.url) {
      const res = await fetch(image.url)
      if (!res.ok) {
        throw new Error(`Failed to download generated image from "${image.url}": HTTP ${res.status}`)
      }
      return Buffer.from(await res.arrayBuffer())
    }

    throw new Error('OpenAICompatibleImageProvider image response contained neither b64_json nor url')
  }
}

function mimeTypeForPath(ref: string): string {
  const ext = path.extname(ref.split('?')[0]).toLowerCase()
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.webp':
      return 'image/webp'
    case '.gif':
      return 'image/gif'
    default:
      return 'image/png'
  }
}
