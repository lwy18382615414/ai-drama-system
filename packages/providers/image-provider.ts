export interface ImageGenerationRequest {
  prompt: string
  negativePrompt?: string
  width?: number
  height?: number
  style?: string
  metadata?: Record<string, unknown>
}

export interface ImageGenerationResult {
  imageUrl: string
  provider: string
  model: string
  raw?: unknown
}

export interface ImageProvider {
  name: string
  model: string
  generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult>
}

export class MockImageProvider implements ImageProvider {
  readonly name = 'mock'
  readonly model: string

  constructor(
    private readonly responseFactory?: (request: ImageGenerationRequest) => Partial<ImageGenerationResult> | string,
    model = 'mock-image-v1',
  ) {
    this.model = model
  }

  async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const result = this.responseFactory?.(request)

    if (typeof result === 'string') {
      return {
        imageUrl: result,
        provider: this.name,
        model: this.model,
        raw: { request },
      }
    }

    return {
      imageUrl: result?.imageUrl ?? this.buildPlaceholderUrl(request),
      provider: result?.provider ?? this.name,
      model: result?.model ?? this.model,
      raw: result?.raw ?? { request },
    }
  }

  private buildPlaceholderUrl(request: ImageGenerationRequest) {
    const width = request.width ?? 512
    const height = request.height ?? 512
    const targetType = String(request.metadata?.targetType ?? 'image')
    return `/static/mock-images/${targetType}-${width}x${height}.png`
  }
}
