import { access } from 'node:fs/promises'
import path from 'node:path'
import {
  OpenAICompatibleChatImageProvider,
  OpenAICompatibleImageProvider,
  type ImageProvider,
} from '../packages/providers/index.js'

async function main() {
  const apiKey = process.env.IMAGE_PROVIDER_API_KEY
  const baseURL = process.env.IMAGE_PROVIDER_BASE_URL
  if (!apiKey || !baseURL) {
    throw new Error('Set IMAGE_PROVIDER_API_KEY and IMAGE_PROVIDER_BASE_URL before running this script.')
  }

  const staticDir = process.env.STATIC_DIR ?? 'data/static'
  const model = process.env.IMAGE_PROVIDER_MODEL ?? 'gpt-image-2'
  const sizeMode =
    process.env.IMAGE_PROVIDER_SIZE_MODE === 'tier' ||
    process.env.IMAGE_PROVIDER_SIZE_MODE === 'pixels'
      ? process.env.IMAGE_PROVIDER_SIZE_MODE
      : /seedream|seededit/i.test(model)
        ? 'tier'
        : 'pixels'
  const transport =
    process.env.IMAGE_PROVIDER_TRANSPORT === 'chat' || process.env.IMAGE_PROVIDER_TRANSPORT === 'images'
      ? process.env.IMAGE_PROVIDER_TRANSPORT
      : /gemini.*image|flash-image|nano.?banana/i.test(model)
        ? 'chat'
        : 'images'

  const provider: ImageProvider =
    transport === 'chat'
      ? new OpenAICompatibleChatImageProvider({ baseURL, apiKey, model, staticDir, staticUrlBase: '/static' })
      : new OpenAICompatibleImageProvider({
          baseURL,
          apiKey,
          model,
          staticDir,
          staticUrlBase: '/static',
          sizeMode,
        })

  const result = await provider.generateImage({
    prompt:
      'Realistic cinematic portrait of a determined female investigative journalist in a beige trench coat, dramatic short-drama lighting, production-ready reference image.',
    width: 1024,
    height: 1024,
    metadata: { smokeTest: true, targetType: 'character_reference_image' },
  })

  console.log(`provider: ${result.provider}, model: ${result.model}`)
  console.log(`imageUrl: ${result.imageUrl}`)

  const filename = result.imageUrl.replace(/^\/static\//, '')
  const filePath = path.join(staticDir, filename)
  await access(filePath)
  console.log(`file written: ${filePath}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
