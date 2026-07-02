import { OpenAI } from 'openai'
import { z } from 'zod/v4'
import type {
  GenerateStructuredJsonRequest,
  GenerateStructuredJsonResult,
  StructuredTextProvider,
} from './text-provider.js'

export interface OpenAICompatibleTextProviderOptions {
  baseURL: string
  apiKey: string
  model: string
}

const TOOL_NAME = 'emit_structured_output'

export class OpenAICompatibleTextProvider implements StructuredTextProvider {
  readonly name = 'openai-compatible'
  readonly model: string

  private readonly client: OpenAI

  constructor(options: OpenAICompatibleTextProviderOptions) {
    this.model = options.model
    this.client = new OpenAI({ baseURL: options.baseURL, apiKey: options.apiKey })
  }

  async generateStructuredJson<T>(
    request: GenerateStructuredJsonRequest<T>,
  ): Promise<GenerateStructuredJsonResult<T>> {
    const jsonSchema = z.toJSONSchema(request.schema as z.ZodType, { target: 'draft-7' })
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: request.systemPrompt },
      { role: 'user', content: request.userPrompt },
    ]

    const firstAttempt = await this.callModel(request, jsonSchema, messages)
    const firstResult = this.tryParse(request, firstAttempt)
    if (firstResult.success) {
      return this.toResult(firstResult.data, firstAttempt.parsedArguments)
    }

    messages.push(
      { role: 'assistant', content: firstAttempt.rawText },
      {
        role: 'user',
        content: `The previous response did not match the required schema "${request.schemaName}". Zod validation error:\n${firstResult.error}\n\nCall ${TOOL_NAME} again with corrected arguments that satisfy the schema exactly.`,
      },
    )

    const secondAttempt = await this.callModel(request, jsonSchema, messages)
    const secondResult = this.tryParse(request, secondAttempt)
    if (secondResult.success) {
      return this.toResult(secondResult.data, secondAttempt.parsedArguments)
    }

    throw new Error(
      `OpenAICompatibleTextProvider failed to produce valid output for schema "${request.schemaName}" after retry: ${secondResult.error}`,
    )
  }

  private async callModel(
    request: GenerateStructuredJsonRequest<unknown>,
    jsonSchema: unknown,
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  ): Promise<{ rawText: string; parsedArguments: unknown }> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages,
      tools: [
        {
          type: 'function',
          function: {
            name: TOOL_NAME,
            description: `Emit the structured output for schema "${request.schemaName}".`,
            parameters: jsonSchema as Record<string, unknown>,
          },
        },
      ],
      tool_choice: { type: 'function', function: { name: TOOL_NAME } },
    })

    const toolCall = completion.choices[0]?.message?.tool_calls?.[0]
    if (!toolCall || toolCall.type !== 'function') {
      throw new Error(
        `OpenAICompatibleTextProvider received no tool call from model "${this.model}" for schema "${request.schemaName}"`,
      )
    }

    const rawText = toolCall.function.arguments
    try {
      return { rawText, parsedArguments: JSON.parse(rawText) }
    } catch {
      return { rawText, parsedArguments: undefined }
    }
  }

  private tryParse<T>(
    request: GenerateStructuredJsonRequest<T>,
    attempt: { rawText: string; parsedArguments: unknown },
  ): { success: true; data: T } | { success: false; error: string } {
    if (attempt.parsedArguments === undefined) {
      return { success: false, error: `Tool call arguments were not valid JSON: ${attempt.rawText}` }
    }

    const parsed = request.schema.safeParse(attempt.parsedArguments)
    if (parsed.success) {
      return { success: true, data: parsed.data }
    }

    return { success: false, error: z.prettifyError(parsed.error) }
  }

  private toResult<T>(data: T, raw: unknown): GenerateStructuredJsonResult<T> {
    return {
      data,
      raw,
      model: this.model,
      provider: this.name,
    }
  }
}
