import type { z } from 'zod'

export interface GenerateStructuredJsonRequest<T> {
  systemPrompt: string
  userPrompt: string
  schemaName: string
  schema: z.ZodType<T>
  metadata?: Record<string, unknown>
}

export interface GenerateStructuredJsonResult<T> {
  data: T
  raw?: unknown
  model: string
  provider: string
}

export interface StructuredTextProvider {
  name: string
  model: string
  generateStructuredJson<T>(
    request: GenerateStructuredJsonRequest<T>,
  ): Promise<GenerateStructuredJsonResult<T>>
}

export class MockStructuredTextProvider implements StructuredTextProvider {
  readonly name = 'mock'
  readonly model: string

  constructor(
    private readonly responseFactory?: (request: GenerateStructuredJsonRequest<unknown>) => unknown,
    model = 'mock-event-extractor-v1',
  ) {
    this.model = model
  }

  async generateStructuredJson<T>(
    request: GenerateStructuredJsonRequest<T>,
  ): Promise<GenerateStructuredJsonResult<T>> {
    const data = this.responseFactory
      ? this.responseFactory(request as GenerateStructuredJsonRequest<unknown>)
      : this.defaultResponse(request)

    const parsed = request.schema.parse(data)

    return {
      data: parsed,
      raw: data,
      model: this.model,
      provider: this.name,
    }
  }

  private defaultResponse<T>(request: GenerateStructuredJsonRequest<T>): unknown {
    const chapterId = String(request.metadata?.chapterId ?? 'unknown-chapter')

    return {
      chapterId,
      chapterSummary: 'Mock chapter summary for local smoke testing.',
      events: [
        {
          eventNo: 1,
          eventType: 'setup',
          summary: 'The protagonist enters the central situation.',
          detail: 'A mock dramatic beat establishes the protagonist, immediate pressure, and story direction.',
          characters: [],
          location: undefined,
          timeHint: undefined,
          emotionTone: 'tense',
          conflictLevel: 'low',
          importance: 'major',
          sourceTextRange: undefined,
        },
      ],
      totalEvents: 1,
    }
  }
}
