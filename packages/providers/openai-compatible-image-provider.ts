import { mkdir, writeFile } from 'node:fs/promises'
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
}

type OpenAIImageSize = '256x256' | '512x512' | '1024x1024' | '1536x1024' | '1024x1536'

export class OpenAICompatibleImageProvider implements ImageProvider {
  readonly name = 'openai-compatible'
  readonly model: string

  private readonly client: OpenAI
  private readonly staticDir: string
  private readonly staticUrlBase: string

  constructor(options: OpenAICompatibleImageProviderOptions) {
    this.model = options.model
    this.client = new OpenAI({ baseURL: options.baseURL, apiKey: options.apiKey })
    this.staticDir = options.staticDir
    this.staticUrlBase = (options.staticUrlBase ?? '/static').replace(/\/$/, '')
  }

  async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const response = await this.client.images.generate({
      model: this.model,
      prompt: this.buildPrompt(request),
      size: this.resolveSize(request),
      n: 1,
    })

    const image = response.data?.[0]
    if (!image) {
      throw new Error(`OpenAICompatibleImageProvider received no image from model "${this.model}"`)
    }

    const bytes = await this.resolveImageBytes(image)
    const targetType = String(request.metadata?.targetType ?? 'image')
    const filename = `${targetType}-${nanoid()}.png`

    await mkdir(this.staticDir, { recursive: true })
    await writeFile(path.join(this.staticDir, filename), bytes)

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

  private resolveSize(request: ImageGenerationRequest): OpenAIImageSize {
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
