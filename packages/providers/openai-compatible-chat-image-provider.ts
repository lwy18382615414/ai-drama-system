import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { nanoid } from 'nanoid'
import { OpenAI } from 'openai'
import type { ImageGenerationRequest, ImageGenerationResult, ImageProvider } from './image-provider.js'

export interface OpenAICompatibleChatImageProviderOptions {
  baseURL: string
  apiKey: string
  model: string
  /** Directory on disk where generated images are written. */
  staticDir: string
  /** URL prefix under which `staticDir` is served. Defaults to `/static`. */
  staticUrlBase?: string
}

/**
 * Image provider for models that generate images through the chat/completions
 * endpoint rather than the OpenAI images endpoint — notably Gemini image models
 * ("nano banana", e.g. `gemini-3.1-flash-image`) as exposed by CLIProxyAPI. The
 * model returns the image on `choices[0].message.images[]` (a base64 data URI or
 * URL); reference images ride in as multimodal `image_url` content parts, which
 * is what drives Gemini's multi-reference character/scene consistency.
 *
 * This is the transport counterpart to `OpenAICompatibleImageProvider` (images
 * endpoint); they implement the same `ImageProvider` interface and are selected
 * by model at wiring time.
 */
export class OpenAICompatibleChatImageProvider implements ImageProvider {
  readonly name = 'openai-compatible-chat'
  readonly model: string

  private readonly client: OpenAI
  private readonly staticDir: string
  private readonly staticUrlBase: string

  constructor(options: OpenAICompatibleChatImageProviderOptions) {
    this.model = options.model
    this.client = new OpenAI({ baseURL: options.baseURL, apiKey: options.apiKey })
    this.staticDir = options.staticDir
    this.staticUrlBase = (options.staticUrlBase ?? '/static').replace(/\/$/, '')
  }

  async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const timingTag = `[img-timing task=${String(request.metadata?.taskId ?? '?')} type=${String(request.metadata?.targetType ?? '?')}]`

    const encodeStart = Date.now()
    const referenceImages = await this.resolveReferenceImages(request.referenceImages)
    const encodeMs = Date.now() - encodeStart
    const refBytes = referenceImages.reduce((sum, ref) => sum + ref.length, 0)
    console.log(
      `${timingTag} encode: ${referenceImages.length} refs, ~${(refBytes / 1024 / 1024).toFixed(2)}MB base64, ${encodeMs}ms`,
    )

    // Gemini image via chat: prompt text plus any reference images as multimodal
    // `image_url` parts. The images endpoint's `size`/negative-prompt/style don't
    // exist here, so orientation and constraints are folded into the prompt text.
    const content: Array<Record<string, unknown>> = [{ type: 'text', text: this.buildPrompt(request) }]
    for (const dataUri of referenceImages) {
      content.push({ type: 'image_url', image_url: { url: dataUri } })
    }

    const params = {
      model: this.model,
      messages: [{ role: 'user', content }],
    }

    const requestStart = Date.now()
    const response = await this.client.chat.completions.create(
      params as unknown as Parameters<OpenAI['chat']['completions']['create']>[0],
    )
    console.log(`${timingTag} model round-trip (upload+inference): ${Date.now() - requestStart}ms`)

    const imageUrl = this.extractImageUrl(response)
    if (!imageUrl) {
      throw new Error(
        `OpenAICompatibleChatImageProvider received no image from model "${this.model}" (no choices[].message.images[])`,
      )
    }

    const downloadStart = Date.now()
    const { bytes, ext } = await this.resolveImageBytes(imageUrl)
    const targetType = String(request.metadata?.targetType ?? 'image')
    const filename = `${targetType}-${nanoid()}.${ext}`

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

  private buildPrompt(request: ImageGenerationRequest): string {
    const parts = [request.prompt]
    if (request.style) {
      parts.push(`Style: ${request.style}.`)
    }
    if (request.negativePrompt) {
      parts.push(`Avoid: ${request.negativePrompt}.`)
    }
    const aspect = this.aspectHint(request.width, request.height)
    if (aspect) {
      parts.push(aspect)
    }
    return parts.join('\n')
  }

  /**
   * Chat transport has no `size` field, so nudge orientation via prompt text.
   * Gemini derives the final aspect ratio from the request; this only biases it.
   */
  private aspectHint(width?: number, height?: number): string | undefined {
    if (!width || !height || width === height) {
      return undefined
    }
    return width > height
      ? 'Compose in a landscape (16:9) aspect ratio.'
      : 'Compose in a portrait (9:16) aspect ratio.'
  }

  /** Reads `choices[0].message.images[0].image_url.url` off the widened response. */
  private extractImageUrl(response: unknown): string | undefined {
    const choices = (response as { choices?: Array<{ message?: { images?: Array<{ image_url?: { url?: string } }> } }> })
      .choices
    for (const choice of choices ?? []) {
      const url = choice.message?.images?.[0]?.image_url?.url
      if (url) {
        return url
      }
    }
    return undefined
  }

  /**
   * Resolves each reference to a base64 data URI so the model receives the pixels
   * directly. Accepts served asset URLs (`/static/x.png`), absolute local paths,
   * and remote `http(s)` URLs. (Mirrors `OpenAICompatibleImageProvider`.)
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
        const filePath = ref.startsWith(`${this.staticUrlBase}/`)
          ? path.join(this.staticDir, ref.slice(this.staticUrlBase.length + 1))
          : ref
        bytes = await readFile(filePath)
      }

      resolved.push(`data:${mimeTypeForPath(ref)};base64,${bytes.toString('base64')}`)
    }

    return resolved
  }

  /** Handles both base64 `data:` URIs and remote URLs; returns bytes + file ext. */
  private async resolveImageBytes(url: string): Promise<{ bytes: Buffer; ext: string }> {
    if (url.startsWith('data:')) {
      const match = /^data:(?<mime>[^;,]+)?(?:;base64)?,(?<data>.*)$/s.exec(url)
      if (!match?.groups?.data) {
        throw new Error('OpenAICompatibleChatImageProvider could not parse image data URI')
      }
      return {
        bytes: Buffer.from(match.groups.data, 'base64'),
        ext: extForMime(match.groups.mime),
      }
    }

    const res = await fetch(url)
    if (!res.ok) {
      throw new Error(`Failed to download generated image from "${url}": HTTP ${res.status}`)
    }
    return {
      bytes: Buffer.from(await res.arrayBuffer()),
      ext: extForMime(res.headers.get('content-type') ?? undefined),
    }
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

function extForMime(mime?: string): string {
  switch (mime?.split(';')[0].trim()) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/webp':
      return 'webp'
    case 'image/gif':
      return 'gif'
    default:
      return 'png'
  }
}
