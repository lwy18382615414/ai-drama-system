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
    if (request.schemaName === 'ExtractAgentOutput') {
      return {
        characters: [
          {
            name: 'Mock Protagonist',
            alias_json: [],
            role: 'protagonist',
            age: null,
            gender: null,
            appearance: 'Production-ready mock protagonist appearance.',
            personality: 'Determined and emotionally direct.',
            background: null,
            relationship_json: [],
            reference_image_url: null,
            voice_id: null,
            usage_type: 'protagonist',
          },
        ],
        scenes: [
          {
            name: 'Mock location',
            description: 'A mock shooting location for local smoke testing.',
            location_type: 'interior',
            visual_style: 'realistic',
            visual_prompt: 'Realistic short-drama interior location with clear dramatic lighting.',
            reference_image_url: null,
            usage_type: 'primary_location',
          },
        ],
        props: [
          {
            name: 'Mock important object',
            description: 'A mock prop needed by the episode.',
            significance: 'Supports the central dramatic beat.',
            visual_prompt: 'A realistic close-up prop suitable for short-drama production.',
            reference_image_url: null,
            usage_type: 'key_prop',
          },
        ],
      }
    }

    if (request.schemaName === 'ScriptAgentOutput') {
      const episodeId = String(request.metadata?.episodeId ?? 'unknown-episode')

      return {
        title: 'Mock generated script',
        summary: `Mock script generated for ${episodeId}.`,
        duration_seconds: 60,
        opening_hook: 'A striking opening moment pulls the viewer in.',
        ending_hook: 'A final reveal creates urgency for the next episode.',
        script_sections: [
          {
            section_no: 1,
            type: 'opening',
            location: 'Mock location',
            characters: [],
            description: 'The episode opens with immediate dramatic tension.',
            dialogues: [],
            narration: 'A tense moment begins.',
            emotion: 'tense',
          },
          {
            section_no: 2,
            type: 'ending',
            location: 'Mock location',
            characters: [],
            description: 'The conflict lands on a cliffhanger.',
            dialogues: [],
            narration: 'The situation changes suddenly.',
            emotion: 'suspenseful',
          },
        ],
      }
    }

    if (request.schemaName === 'EpisodePlannerOutput') {
      const sourceEventIds = Array.isArray(request.metadata?.sourceEventIds)
        ? request.metadata.sourceEventIds.map(String)
        : []

      return {
        episodes: [
          {
            title: 'Mock planned episode',
            summary: 'Mock episode plan for local smoke testing.',
            opening_hook: 'A dramatic situation begins immediately.',
            ending_hook: 'The conflict escalates into the next episode.',
            source_event_links: sourceEventIds.map((eventId, index) => ({
              novel_event_id: eventId,
              order_in_episode: index + 1,
              usage_type: 'primary',
            })),
          },
        ],
      }
    }

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
