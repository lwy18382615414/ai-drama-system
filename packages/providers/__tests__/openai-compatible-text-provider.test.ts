import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

const createMock = vi.fn()

vi.mock('openai', () => ({
  OpenAI: class {
    chat = { completions: { create: createMock } }
  },
}))

const { OpenAICompatibleTextProvider } = await import('../openai-compatible-text-provider.js')

function toolCallCompletion(argsObj: unknown) {
  return {
    choices: [
      {
        message: {
          tool_calls: [
            {
              type: 'function',
              function: { name: 'emit_structured_output', arguments: JSON.stringify(argsObj) },
            },
          ],
        },
      },
    ],
  }
}

function createProvider() {
  return new OpenAICompatibleTextProvider({
    baseURL: 'https://lv-ai-assistant.xyz:8444',
    apiKey: 'test-key',
    model: 'gpt-5.5',
  })
}

const testSchema = z.object({ title: z.string(), count: z.number() })

describe('OpenAICompatibleTextProvider', () => {
  beforeEach(() => {
    createMock.mockReset()
  })

  it('parses a valid tool call response on the first attempt', async () => {
    createMock.mockResolvedValueOnce(toolCallCompletion({ title: 'hello', count: 3 }))

    const result = await createProvider().generateStructuredJson({
      systemPrompt: 'sys',
      userPrompt: 'user',
      schemaName: 'TestSchema',
      schema: testSchema,
    })

    expect(result.data).toEqual({ title: 'hello', count: 3 })
    expect(result.provider).toBe('openai-compatible')
    expect(result.model).toBe('gpt-5.5')
    expect(createMock).toHaveBeenCalledTimes(1)

    const requestArg = createMock.mock.calls[0][0]
    expect(requestArg.model).toBe('gpt-5.5')
    expect(requestArg.tool_choice).toEqual({ type: 'function', function: { name: 'emit_structured_output' } })
    expect(requestArg.tools[0].function.parameters).toMatchObject({ type: 'object' })
  })

  it('retries once with the zod error message and succeeds on the second attempt', async () => {
    createMock
      .mockResolvedValueOnce(toolCallCompletion({ title: 'hello' }))
      .mockResolvedValueOnce(toolCallCompletion({ title: 'hello', count: 5 }))

    const result = await createProvider().generateStructuredJson({
      systemPrompt: 'sys',
      userPrompt: 'user',
      schemaName: 'TestSchema',
      schema: testSchema,
    })

    expect(result.data).toEqual({ title: 'hello', count: 5 })
    expect(createMock).toHaveBeenCalledTimes(2)

    const secondRequestMessages = createMock.mock.calls[1][0].messages as Array<{ content: unknown }>
    expect(
      secondRequestMessages.some(
        (message) => typeof message.content === 'string' && message.content.includes('Zod validation error'),
      ),
    ).toBe(true)
  })

  it('throws an explicit error when the retry also fails schema validation', async () => {
    createMock
      .mockResolvedValueOnce(toolCallCompletion({ title: 'hello' }))
      .mockResolvedValueOnce(toolCallCompletion({ title: 'still missing count' }))

    await expect(
      createProvider().generateStructuredJson({
        systemPrompt: 'sys',
        userPrompt: 'user',
        schemaName: 'TestSchema',
        schema: testSchema,
      }),
    ).rejects.toThrow(/failed to produce valid output/)

    expect(createMock).toHaveBeenCalledTimes(2)
  })

  it('propagates network/API errors without retrying', async () => {
    createMock.mockRejectedValueOnce(new Error('rate limited'))

    await expect(
      createProvider().generateStructuredJson({
        systemPrompt: 'sys',
        userPrompt: 'user',
        schemaName: 'TestSchema',
        schema: testSchema,
      }),
    ).rejects.toThrow('rate limited')

    expect(createMock).toHaveBeenCalledTimes(1)
  })

  it('throws when the model returns no tool call', async () => {
    createMock.mockResolvedValueOnce({ choices: [{ message: {} }] })

    await expect(
      createProvider().generateStructuredJson({
        systemPrompt: 'sys',
        userPrompt: 'user',
        schemaName: 'TestSchema',
        schema: testSchema,
      }),
    ).rejects.toThrow(/received no tool call/)
  })
})
