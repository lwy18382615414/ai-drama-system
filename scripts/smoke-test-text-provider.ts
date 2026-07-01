import { ScriptAgentOutputSchema } from '../packages/agents/script-agent/schema.js'
import { buildScriptAgentSystemPrompt } from '../packages/agents/script-agent/prompt.js'
import { OpenAICompatibleTextProvider } from '../packages/providers/index.js'

async function main() {
  const apiKey = process.env.TEXT_PROVIDER_API_KEY
  const baseURL = process.env.TEXT_PROVIDER_BASE_URL
  if (!apiKey || !baseURL) {
    throw new Error('Set TEXT_PROVIDER_API_KEY and TEXT_PROVIDER_BASE_URL before running this script.')
  }

  const provider = new OpenAICompatibleTextProvider({
    baseURL,
    apiKey,
    model: process.env.TEXT_PROVIDER_MODEL ?? 'gpt-5.5',
  })

  const result = await provider.generateStructuredJson({
    systemPrompt: buildScriptAgentSystemPrompt(),
    userPrompt: [
      'Generate a short-drama script for the following planned episode.',
      '',
      'Episode: 第1集：宴会背叛',
      'Summary: 林晚回到宴会厅，发现未婚夫和姐姐密谋夺走公司，当众揭穿真相。',
      'Opening hook: 林晚回到宴会厅时听见熟悉的声音在密谋。',
      'Ending hook: 她抬头看向众人，准备撕开真相。',
      'Target duration: 60 seconds.',
    ].join('\n'),
    schemaName: 'ScriptAgentOutput',
    schema: ScriptAgentOutputSchema,
    metadata: { smokeTest: true },
  })

  console.log(`provider: ${result.provider}, model: ${result.model}`)
  console.log(JSON.stringify(result.data, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
